import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DITHER_ALGORITHMS, defaultConfig, presetConfigs } from '../src/core/config';
import type { DitherAlgorithm, ImageConfig } from '../src/core/config';
import type { GrayImage } from '../src/core/image';
import { levelsToGray } from '../src/core/dither';
import { cropOverlay, otherSlot } from '../src/core/framing';
import type { CropRect, Framing, ImageSlot } from '../src/core/framing';
import { generateModel, modelToSTL } from '../src/core/pipeline';
import type { ShadowCasterModel } from '../src/core/pipeline';
import { castShadows, cellBrightness, renderShadow } from '../src/core/simulate';
import { readImageFile, writeGrayPNG } from './imageio';

const USAGE = `Usage: shadow-caster --horiz <image> [--vert <image>] [options]

Generates a printable STL that shows one image when lit from the left and another when lit
from the back. Darker pixels become taller walls that cast longer shadows.

Images:
  --horiz <file>        PNG/JPEG shown when lit from the left (-X)
  --vert <file>         PNG/JPEG shown when lit from the back (+Y)
  --lead <horiz|vert>   Image used whole; its aspect ratio sets the grid's (default horiz).
                        The other image is cropped to match, never stretched.
  --crop <x0,y0,x1,y1>  Region of the other image to use, as top-left and bottom-right corners in
                        its pixels (default: all of it). The largest part of it with the lead
                        image's aspect ratio is used, centred.

Output:
  -o, --out <file>      STL path (default: derived from the parameters)
  --preview <dir>       Also write PNGs of the dithered levels and simulated shadows
  --json                Print model stats as JSON

Parameters:
  --preset <name>       Start from a preset: ${Object.keys(presetConfigs).join(', ')}
  --width <cells>       Grid width in cells (default ${defaultConfig.widthInPixels})
  --cell <mm>           Cell size incl. wall (default ${defaultConfig.cellSize})
  --wall <mm>           Wall thickness (default ${defaultConfig.wallWidth})
  --bottom <mm>         Base plate thickness (default ${defaultConfig.bottomThk})
  --border <mm>         Plain base plate around the grid (default ${defaultConfig.border})
  --layer <mm>          Layer height; every wall is a multiple of it (default ${defaultConfig.layerHeight})
  --colors <n>          Number of wall heights, spread from one layer to the max
                        (default: one per layer)
  --dither <alg>        ${DITHER_ALGORITHMS.join(' | ')} (default ${defaultConfig.dither})
  --no-serpentine       Scan every row left to right when dithering
  --gamma <g>           Tone curve, darkness = 1 - gray^g (default ${defaultConfig.gamma})
  -h, --help            Show this help
`;

export interface CliResult {
  model: ShadowCasterModel;
  outPath: string;
}

function numberOption(values: Record<string, unknown>, key: string): number | undefined {
  const raw = values[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${key} expects a number, got "${raw}"`);
  return n;
}

export function parseCli(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      horiz: { type: 'string' },
      vert: { type: 'string' },
      lead: { type: 'string' },
      crop: { type: 'string' },
      out: { type: 'string', short: 'o' },
      preview: { type: 'string' },
      json: { type: 'boolean', default: false },
      preset: { type: 'string' },
      width: { type: 'string' },
      cell: { type: 'string' },
      wall: { type: 'string' },
      bottom: { type: 'string' },
      border: { type: 'string' },
      layer: { type: 'string' },
      colors: { type: 'string' },
      dither: { type: 'string' },
      'no-serpentine': { type: 'boolean', default: false },
      gamma: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  let base: ImageConfig = defaultConfig;
  if (values.preset !== undefined) {
    if (!(values.preset in presetConfigs)) {
      throw new Error(`Unknown preset "${values.preset}". Choose from ${Object.keys(presetConfigs).join(', ')}`);
    }
    base = presetConfigs[values.preset as keyof typeof presetConfigs];
  }
  if (values.dither !== undefined && !DITHER_ALGORITHMS.includes(values.dither as DitherAlgorithm)) {
    throw new Error(`--dither must be one of ${DITHER_ALGORITHMS.join(', ')}`);
  }
  const config: ImageConfig = {
    ...base,
    widthInPixels: numberOption(values, 'width') ?? base.widthInPixels,
    cellSize: numberOption(values, 'cell') ?? base.cellSize,
    wallWidth: numberOption(values, 'wall') ?? base.wallWidth,
    bottomThk: numberOption(values, 'bottom') ?? base.bottomThk,
    border: numberOption(values, 'border') ?? base.border,
    layerHeight: numberOption(values, 'layer') ?? base.layerHeight,
    numberOfColorsOverride: numberOption(values, 'colors') ?? base.numberOfColorsOverride,
    dither: (values.dither as DitherAlgorithm | undefined) ?? base.dither,
    serpentine: values['no-serpentine'] ? false : base.serpentine,
    gamma: numberOption(values, 'gamma') ?? base.gamma,
    doHorizImage: values.horiz !== undefined,
    doVertImage: values.vert !== undefined,
  };
  if (values.lead !== undefined && values.lead !== 'horiz' && values.lead !== 'vert') {
    throw new Error(`--lead must be horiz or vert, got "${values.lead}"`);
  }
  const framing: Framing = {
    lead: (values.lead as ImageSlot | undefined) ?? 'horiz',
    crop: values.crop === undefined ? null : parseCrop(values.crop),
  };
  return { values, config, framing };
}

function parseCrop(raw: string): CropRect {
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    throw new Error(`--crop expects x0,y0,x1,y1 (four numbers), got "${raw}"`);
  }
  const [x0, y0, x1, y1] = parts;
  return { x0, y0, x1, y1 };
}

export function runCli(argv: string[], log: (line: string) => void = console.log): CliResult | null {
  const { values, config, framing } = parseCli(argv);
  if (values.help) {
    log(USAGE);
    return null;
  }
  if (!values.horiz && !values.vert) {
    throw new Error(`At least one of --horiz or --vert is required\n\n${USAGE}`);
  }

  // `npm run cli` runs from web/; resolve paths against wherever npm was invoked instead.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const started = performance.now();
  const horiz = values.horiz ? readImageFile(resolve(cwd, values.horiz)) : null;
  const vert = values.vert ? readImageFile(resolve(cwd, values.vert)) : null;
  const model = generateModel({ horiz, vert, config, framing });
  const stl = modelToSTL(model);
  const outPath = resolve(cwd, values.out ?? model.config.outputFilename);
  writeFileSync(outPath, stl);
  const elapsed = performance.now() - started;

  const previewDir = values.preview && resolve(cwd, values.preview);
  if (previewDir) writePreviews(model, { horiz, vert }, previewDir);

  const { stats } = model;
  if (values.json) {
    log(JSON.stringify({ outPath, ...stats, lead: model.lead, crop: model.crop, numberOfColors: model.config.numberOfColors, maxHeight: model.config.maxHeight, ms: Math.round(elapsed) }, null, 2));
  } else {
    log(`Wrote ${outPath}`);
    log(`  grid       ${stats.cols} x ${stats.rows} cells, ${model.config.numberOfColors} height levels (max wall ${model.config.maxHeight.toFixed(2)} mm)`);
    log(`  size       ${stats.widthMm.toFixed(1)} x ${stats.depthMm.toFixed(1)} x ${stats.heightMm.toFixed(2)} mm`);
    if (model.crop && model.lead) {
      const c = model.crop;
      log(`  crop       ${otherSlot(model.lead)} image ${c.x0},${c.y0} -> ${c.x1},${c.y1} (${c.x1 - c.x0} x ${c.y1 - c.y0} px), ${model.lead} image used whole`);
    }
    log(`  mesh       ${stats.triangles.toLocaleString()} triangles, ${(stats.stlBytes / 1e6).toFixed(1)} MB`);
    log(`  time       ${(elapsed / 1000).toFixed(2)} s`);
    if (previewDir) log(`  previews   ${previewDir}`);
  }
  return { model, outPath };
}

function writePreviews(model: ShadowCasterModel, sources: Record<ImageSlot, GrayImage | null>, dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (model.crop && model.lead) {
    const slot = otherSlot(model.lead);
    writeGrayPNG(join(dir, `${slot}-crop.png`), cropOverlay(sources[slot]!, model.crop, 800));
  }
  const pxPerMm = Math.max(1, Math.min(8, 1600 / model.stats.widthMm));
  const lights = [
    { name: 'horiz', levels: model.horizLevels, direction: 'west' as const },
    { name: 'vert', levels: model.vertLevels, direction: 'north' as const },
  ];
  for (const { name, levels, direction } of lights) {
    if (!levels) continue;
    writeGrayPNG(join(dir, `${name}-dithered.png`), levelsToGray(levels));
    const shadows = castShadows(model.heightfield, direction);
    writeGrayPNG(join(dir, `${name}-shadow.png`), renderShadow(model.heightfield, shadows, pxPerMm));
    writeGrayPNG(
      join(dir, `${name}-shadow-cells.png`),
      // Walls are printed in black over a white base, so only the lit floor counts as bright.
      cellBrightness(model.heightfield, shadows, model.layout, model.config.cellSize, model.config.bottomThk),
    );
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
