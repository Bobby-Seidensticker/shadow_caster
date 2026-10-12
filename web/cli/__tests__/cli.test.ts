import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig, presetConfigs } from '../../src/core/config';
import { decodeBinarySTL } from '../../src/core/stl';
import { fixturePath } from '../../src/test/fixtures';
import { decodeImage, encodeGrayPNG } from '../imageio';
import { parseCli, runCli } from '../shadow-caster';
import jpeg from 'jpeg-js';

const dir = mkdtempSync(join(tmpdir(), 'shadow-caster-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const quiet = () => {};

describe('parseCli', () => {
  it('starts from the defaults and only enables the images given', () => {
    const { config, framing } = parseCli(['--horiz', 'a.png']);
    expect(config).toEqual({ ...defaultConfig, doHorizImage: true, doVertImage: false });
    expect(framing).toEqual({ lead: 'horiz', crop: null });
  });

  it('parses the lead image and crop corners', () => {
    const { framing } = parseCli(['--lead', 'vert', '--crop', '10, 20,300,400']);
    expect(framing).toEqual({ lead: 'vert', crop: { x0: 10, y0: 20, x1: 300, y1: 400 } });
    expect(() => parseCli(['--lead', 'left'])).toThrow(/--lead must be horiz or vert/);
    expect(() => parseCli(['--crop', '1,2,3'])).toThrow(/--crop expects x0,y0,x1,y1/);
  });

  it('maps every flag onto the config', () => {
    const { config } = parseCli([
      '--horiz', 'a.png', '--vert', 'b.jpg', '--preset', 'p2', '--width', '33', '--cell', '1.5',
      '--wall', '0.3', '--bottom', '1.2', '--border', '0', '--layer', '0.08', '--colors', '6',
      '--dither', 'atkinson', '--no-serpentine', '--isolation-posts', '--gamma', '2.2',
    ]);
    expect(config).toEqual({
      ...presetConfigs.p2,
      widthInPixels: 33,
      cellSize: 1.5,
      wallWidth: 0.3,
      bottomThk: 1.2,
      border: 0,
      layerHeight: 0.08,
      numberOfColorsOverride: 6,
      dither: 'atkinson',
      serpentine: false,
      isolationPosts: true,
      gamma: 2.2,
      doHorizImage: true,
      doVertImage: true,
    });
  });

  it('rejects bad input with a helpful message', () => {
    expect(() => parseCli(['--width', 'wide'])).toThrow(/--width expects a number/);
    expect(() => parseCli(['--dither', 'halftone'])).toThrow(/--dither must be one of/);
    expect(() => parseCli(['--preset', 'huge'])).toThrow(/Unknown preset/);
    expect(() => parseCli(['--bogus'])).toThrow();
  });
});

describe('runCli', () => {
  it('writes a valid STL and previews from real images', () => {
    const out = join(dir, 'fuji.stl');
    const previews = join(dir, 'previews');
    const lines: string[] = [];
    const result = runCli(
      ['--horiz', fixturePath('great_wave'), '--vert', fixturePath('red_fuji'), '--preset', 'fuji', '--width', '40', '-o', out, '--preview', previews],
      (line) => lines.push(line),
    );
    expect(result!.outPath).toBe(out);
    const stl = decodeBinarySTL(readFileSync(out));
    expect(stl.triangles).toHaveLength(result!.model.stats.triangles);
    expect(stl.header).toMatch(/^Shadow Caster 40x\d+ cell=1.1 wall=0.22 layer=0.05/);
    for (const name of ['horiz-dithered', 'horiz-shadow', 'horiz-shadow-cells', 'vert-dithered', 'vert-shadow', 'vert-shadow-cells']) {
      const png = decodeImage(readFileSync(join(previews, `${name}.png`)));
      expect(png.width).toBeGreaterThan(0);
    }
    expect(lines.join('\n')).toMatch(/Wrote .*fuji\.stl/);
    expect(lines.join('\n')).toMatch(/40 x \d+ cells, 17 height levels/);
  });

  it('crops the other image to the lead image and previews the crop', () => {
    const previews = join(dir, 'crop-previews');
    const lines: string[] = [];
    const result = runCli(
      ['--horiz', fixturePath('great_wave'), '--vert', fixturePath('red_fuji'), '--lead', 'vert', '--crop', '0,0,60,500',
        '--width', '20', '-o', join(dir, 'crop.stl'), '--preview', previews],
      (line) => lines.push(line),
    );
    const { model } = result!;
    expect(model.lead).toBe('vert');
    // The crop is narrowed to the vertical image's aspect ratio, never stretched.
    const fuji = decodeImage(readFileSync(fixturePath('red_fuji')));
    const crop = model.crop!;
    expect(crop.x1 - crop.x0).toBe(60);
    expect((crop.x1 - crop.x0) / (crop.y1 - crop.y0)).toBeCloseTo(fuji.width / fuji.height, 1);
    expect(lines.join('\n')).toMatch(/crop {7}horiz image 0,\d+ -> 60,\d+/);
    expect(decodeImage(readFileSync(join(previews, 'horiz-crop.png'))).width).toBeGreaterThan(0);
  });

  it('prints machine readable stats with --json', () => {
    const lines: string[] = [];
    runCli(['--vert', fixturePath('red_fuji'), '--width', '20', '-o', join(dir, 'v.stl'), '--json'], (l) => lines.push(l));
    const stats = JSON.parse(lines.join('\n'));
    expect(stats.cols).toBe(20);
    expect(stats.numberOfColors).toBe(9);
    expect(stats.outPath).toBe(join(dir, 'v.stl'));
  });

  it('prints usage for --help without generating anything', () => {
    const lines: string[] = [];
    expect(runCli(['--help'], (l) => lines.push(l))).toBeNull();
    expect(lines[0]).toMatch(/^Usage: shadow-caster/);
  });

  it('requires at least one image', () => {
    expect(() => runCli([], quiet)).toThrow(/--horiz or --vert/);
  });

  it('runs as a standalone command', () => {
    const out = join(dir, 'standalone.stl');
    execFileSync('npx', ['tsx', 'cli/shadow-caster.ts', '--horiz', fixturePath('great_wave'), '--width', '12', '-o', out], {
      cwd: join(__dirname, '..', '..'),
      stdio: 'pipe',
    });
    expect(existsSync(out)).toBe(true);
    expect(decodeBinarySTL(readFileSync(out)).triangles.length).toBeGreaterThan(0);
  }, 30000);

  it('exits non-zero with a message on bad input', () => {
    expect(() => execFileSync('npx', ['tsx', 'cli/shadow-caster.ts', '--horiz', join(dir, 'missing.png')], {
      cwd: join(__dirname, '..', '..'),
      stdio: 'pipe',
    })).toThrow(/ENOENT|no such file/);
  }, 30000);
});

describe('decodeImage', () => {
  it('reads PNG and JPEG and rejects other formats', () => {
    const gray = { width: 3, height: 2, data: Float32Array.from([0, 50, 100, 150, 200, 255]) };
    const png = decodeImage(encodeGrayPNG(gray));
    expect(Array.from(png.data)).toEqual(Array.from(gray.data));

    const rgba = Buffer.alloc(16 * 16 * 4, 255);
    const jpg = decodeImage(jpeg.encode({ data: rgba, width: 16, height: 16 }, 95).data);
    expect(jpg.width).toBe(16);
    expect(jpg.data[0]).toBeGreaterThan(250);

    expect(() => decodeImage(new Uint8Array([1, 2, 3, 4]), 'x.gif')).toThrow(/x.gif: unsupported/);
  });
});
