import { describe, expect, it } from 'vitest';
import { DITHER_ALGORITHMS, computeImageConfig, defaultConfig, isolationPostTop, presetConfigs, wallTop } from '../config';
import type { ImageConfig } from '../config';
import { darknessLevel } from '../dither';
import { createGray, resizeToWidth } from '../image';
import { SLICE_PLANE_CLEARANCE as C } from '../layout';
import { fitImages, generateModel, modelToSTL } from '../pipeline';
import { castShadows, cellBrightness } from '../simulate';
import { decodeBinarySTL } from '../stl';
import { grayFromFunction, loadFixture } from '../../test/fixtures';
import { analyzeMesh, correlation } from '../../test/meshCheck';

const wave = loadFixture('great_wave');
const fuji = loadFixture('red_fuji');

describe('fitImages', () => {
  const tall = grayFromFunction(100, 200, (_, y) => y);
  const wide = grayFromFunction(200, 100, (x) => x);

  it('keeps the lead image whole and centre-crops the other to its aspect ratio', () => {
    const { horiz, vert, lead, crop } = fitImages(tall, wide, 20);
    expect(lead).toBe('horiz');
    expect([horiz!.width, horiz!.height]).toEqual([20, 40]);
    expect([vert!.width, vert!.height]).toEqual([20, 40]);
    // The 200x100 image is cut to a 1:2 strip from its middle: columns 75..124.
    expect(crop).toEqual({ x0: 75, y0: 0, x1: 125, y1: 100 });
    // Each output column covers 2.5 source columns: the first is (75 + 76 + 77 / 2) / 2.5.
    expect(vert!.data[0]).toBeCloseTo(75.8, 4);
  });

  it('lets the other image lead', () => {
    const { horiz, vert, lead, crop } = fitImages(tall, wide, 20, { lead: 'vert', crop: null });
    expect(lead).toBe('vert');
    expect([vert!.width, vert!.height]).toEqual([20, 10]);
    expect([horiz!.width, horiz!.height]).toEqual([20, 10]);
    // The middle 100x50 of the tall image: rows 75..124, so output row 0 averages rows 75..79.
    expect(crop).toEqual({ x0: 0, y0: 75, x1: 100, y1: 125 });
    expect(horiz!.data[0]).toBeCloseTo(77, 4);
  });

  it('crops within the requested region, never stretching it', () => {
    // A 50x100 region is taller than the lead's 2:1, so it is narrowed to 50x25, centred.
    const { horiz, crop } = fitImages(tall, wide, 20, { lead: 'vert', crop: { x0: 10, y0: 100, x1: 60, y1: 200 } });
    expect(crop).toEqual({ x0: 10, y0: 137, x1: 60, y1: 162 });
    expect([horiz!.width, horiz!.height]).toEqual([20, 10]);
    expect(horiz!.data[0]).toBeCloseTo(137.8, 4);
  });

  it('keeps a single image whole', () => {
    const { horiz, vert, lead, crop } = fitImages(null, wave, 40, { lead: 'horiz', crop: { x0: 0, y0: 0, x1: 5, y1: 5 } });
    expect(horiz).toBeNull();
    expect(lead).toBe('vert');
    expect(crop).toBeNull();
    expect(vert!.height).toBe(Math.round((40 * wave.height) / wave.width));
  });
});

describe('generateModel', () => {
  const config: ImageConfig = { ...presetConfigs.fuji, widthInPixels: 60 };

  it('rejects missing or disabled images and invalid configs', () => {
    expect(() => generateModel({ horiz: null, vert: null, config })).toThrow(/At least one/);
    expect(() => generateModel({ horiz: wave, vert: null, config: { ...config, doHorizImage: false } })).toThrow(/At least one/);
    expect(() => generateModel({ horiz: wave, vert: null, config: { ...config, wallWidth: 5 } })).toThrow(/Invalid config/);
  });

  it('ignores an image whose direction is switched off', () => {
    const model = generateModel({ horiz: wave, vert: fuji, config: { ...config, doVertImage: false } });
    expect(model.vertLevels).toBeNull();
    // No isolation posts without a second image: nothing is taller than the tallest wall.
    let tallest = 0;
    for (const k of model.horizLevels!.data) tallest = Math.max(tallest, wallTop(model.config, k) - C);
    expect(model.stats.heightMm).toBeCloseTo(tallest, 9);
  });

  it('reports stats that match the actual mesh and STL', () => {
    const model = generateModel({ horiz: wave, vert: fuji, config });
    const stl = modelToSTL(model);
    const report = analyzeMesh(model.mesh);
    const c = computeImageConfig(config);
    expect(model.stats.cols).toBe(60);
    // The horizontal image leads by default, so it sets the number of rows.
    expect(model.stats.rows).toBe(Math.round((60 * wave.height) / wave.width));
    // The plate is trimmed by one open floor width where the last column and row have no walls.
    const trim = c.cellSize - c.wallWidth;
    expect(model.stats.widthMm).toBeCloseTo(60 * c.cellSize + 2 * c.border - trim, 9);
    expect(model.stats.depthMm).toBeCloseTo(model.stats.rows * c.cellSize + 2 * c.border - trim, 9);
    expect(model.stats.heightMm).toBeCloseTo(isolationPostTop(c) - C, 9);
    expect(model.stats.stlBytes).toBe(stl.byteLength);
    expect(model.stats.triangles).toBe(report.triangles);
    expect(model.stats.volumeMm3).toBeCloseTo(report.volume, 0);
    expect(report.max[0]).toBeCloseTo(model.stats.widthMm, 4);
    expect(report.max[1]).toBeCloseTo(model.stats.depthMm, 4);
    expect(report.max[2]).toBeCloseTo(model.stats.heightMm, 4);
    expect(report.min).toEqual([0, 0, 0]);
    expect(decodeBinarySTL(stl).triangles).toHaveLength(report.triangles);
  });

  it.each(DITHER_ALGORITHMS)('produces a watertight mesh from real photos with %s dithering', (dither) => {
    for (const isolationPosts of [true, false]) {
      const model = generateModel({ horiz: wave, vert: fuji, config: { ...config, dither, isolationPosts } });
      const report = analyzeMesh(model.mesh);
      expect(report.nonManifoldEdges).toBe(0);
      expect(report.misorientedEdges).toBe(0);
      expect(report.degenerateTriangles).toBe(0);
      expect(report.components).toBe(1);
      expect(report.eulerCharacteristic).toBe(2);
    }
  });

  it('only uses heights that are whole layers (less the slicer clearance)', () => {
    const model = generateModel({ horiz: wave, vert: fuji, config });
    const c = model.config;
    for (const z of new Set(model.heightfield.z)) {
      const layers = (z + C) / c.layerHeight;
      expect(Math.abs(layers - Math.round(layers))).toBeLessThan(1e-6);
    }
  });

  it('is deterministic', () => {
    const a = modelToSTL(generateModel({ horiz: wave, vert: fuji, config }));
    const b = modelToSTL(generateModel({ horiz: wave, vert: fuji, config }));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('end to end: the printed shadows look like the input photos', () => {
  const config: ImageConfig = { ...defaultConfig, widthInPixels: 80 };
  const model = generateModel({ horiz: wave, vert: fuji, config });
  const { heightfield: hf, layout } = model;
  const west = cellBrightness(hf, castShadows(hf, 'west'), layout, config.cellSize);
  const north = cellBrightness(hf, castShadows(hf, 'north'), layout, config.cellSize);
  const fitted = fitImages(wave, fuji, 80);
  const { cols, rows } = model.stats;
  // With both images, the horizontal one has no walls in its last row and the vertical one none in
  // its last column; these crop each image to the cells that do.
  const cropH = (data: ArrayLike<number>) => Float64Array.from(data).subarray(0, cols * (rows - 1));
  const cropV = (data: ArrayLike<number>) => Float64Array.from(data).filter((_, k) => k % cols !== cols - 1);

  it('reproduces the dithered target exactly (brightness is a linear function of level)', () => {
    const targetH = Float64Array.from(model.horizLevels!.data, (k) => -k);
    const targetV = Float64Array.from(model.vertLevels!.data, (k) => -k);
    expect(correlation(cropH(west.data), cropH(targetH))).toBeGreaterThan(0.9999);
    expect(correlation(cropV(north.data), cropV(targetV))).toBeGreaterThan(0.9999);
  });

  it('matches the original photos once viewed from a little distance', () => {
    // Dithering noise averages out over a few cells, so compare 2x2-cell blocks.
    const blocks = (data: ArrayLike<number>, w: number, h: number) =>
      resizeToWidth({ width: w, height: h, data: Float32Array.from(data) }, Math.floor(w / 2)).data;
    expect(correlation(blocks(cropH(west.data), cols, rows - 1), blocks(cropH(fitted.horiz!.data), cols, rows - 1))).toBeGreaterThan(0.97);
    expect(correlation(blocks(cropV(north.data), cols - 1, rows), blocks(cropV(fitted.vert!.data), cols - 1, rows))).toBeGreaterThan(0.97);
  });

  it('shows no trace of the other image', () => {
    // The photos themselves are somewhat correlated, so compare against a model built with a
    // blank other image: the shadow must be identical.
    const blankVert = generateModel({ horiz: wave, vert: createGray(fuji.width, fuji.height, 255), config });
    const westBlank = cellBrightness(blankVert.heightfield, castShadows(blankVert.heightfield, 'west'), blankVert.layout, config.cellSize);
    expect(west.data).toEqual(westBlank.data);
  });

  it('keeps tones in the right order: black regions darker than white', () => {
    const mid = darknessLevel(127.5, model.config.numberOfColors, 1);
    let darkSum = 0, darkN = 0, lightSum = 0, lightN = 0;
    model.horizLevels!.data.forEach((k, i) => {
      if (k > mid) { darkSum += west.data[i]; darkN++; } else { lightSum += west.data[i]; lightN++; }
    });
    expect(darkSum / darkN).toBeLessThan(lightSum / lightN - 30);
  });
});

describe('performance', () => {
  it('generates a 200-cell two-image model quickly', () => {
    const big = { ...presetConfigs.fuji, widthInPixels: 200 };
    const started = performance.now();
    const model = generateModel({ horiz: wave, vert: fuji, config: big });
    const stl = modelToSTL(model);
    const elapsed = performance.now() - started;
    expect(model.stats.cols).toBe(200);
    expect(stl.byteLength).toBeGreaterThan(1e6);
    // ~1 s on a laptop; the old Three.js path took minutes and often ran out of memory here.
    expect(elapsed).toBeLessThan(15000);
  });
});
