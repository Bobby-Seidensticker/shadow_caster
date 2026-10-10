import { describe, expect, it } from 'vitest';
import {
  computeImageConfig,
  defaultConfig,
  format,
  isolationPostTop,
  levelTones,
  presetConfigs,
  validateConfig,
  wallLayers,
  wallTop,
} from '../config';

describe('computeImageConfig', () => {
  it('derives the number of levels so the tallest wall matches the open floor width', () => {
    const c = computeImageConfig(defaultConfig);
    expect(c.numberOfColors).toBe(9);
    expect(c.maxHeight).toBeCloseTo(0.9, 12);
    expect(c.maxHeight).toBeLessThanOrEqual(c.cellSize - c.wallWidth + 1e-9);
  });

  it.each([
    [1.2, 0.4, 0.1, 8],
    [1.5, 0.3, 0.1, 12],
    [0.9, 0.2, 0.1, 7],
    [1, 0.4, 0.2, 3],
  ])('is not fooled by floating point: cell %f, wall %f, layer %f -> %i levels', (cellSize, wallWidth, layerHeight, levels) => {
    // e.g. (1.2 - 0.4) / 0.1 is 7.999999999999999 in floating point; the Dart version floored
    // that to 7, quietly losing a level.
    expect(computeImageConfig({ ...defaultConfig, cellSize, wallWidth, layerHeight }).numberOfColors).toBe(levels);
  });

  it.each([
    ['p2', 16, 0.8],
    ['p3', 17, 0.85],
    ['fuji', 17, 0.85],
  ] as const)('preset %s has %i levels up to %f mm', (name, levels, maxHeight) => {
    const c = computeImageConfig(presetConfigs[name]);
    expect(c.numberOfColors).toBe(levels);
    expect(c.maxHeight).toBeCloseTo(maxHeight, 12);
  });

  it('spreads an explicit number of levels over the full height', () => {
    const c = computeImageConfig({ ...defaultConfig, numberOfColorsOverride: 5 });
    expect(c.numberOfColors).toBe(5);
    expect(c.maxHeight).toBeCloseTo(0.9, 12);
    expect([0, 1, 2, 3, 4].map((k) => wallLayers(c, k))).toEqual([1, 3, 5, 7, 9]);
    expect(c.outputFilename).toBe('25px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_1.20border_5levels.stl');
  });

  it('gives three levels as min, half and max height', () => {
    const c = computeImageConfig({ ...defaultConfig, cellSize: 1.1, wallWidth: 0.22, bottomThk: 0.9, numberOfColorsOverride: 3 });
    expect(c.maxLayers).toBe(8);
    expect([0, 1, 2].map((k) => wallTop(c, k) - c.bottomThk)).toEqual([0.1, 0.4, 0.8].map((h) => expect.closeTo(h, 12)));
    // 4 layers sits 3/7 of the way from 1 to 8 layers.
    expect(levelTones(c)).toEqual([0, 6 / 7, 2].map((t) => expect.closeTo(t, 12)));
  });

  it('has one evenly spaced tone per layer by default', () => {
    const c = computeImageConfig(defaultConfig);
    expect(levelTones(c)).toEqual(Array.from({ length: 9 }, (_, k) => expect.closeTo(k, 12)));
    for (let k = 0; k < 9; k++) expect(wallLayers(c, k)).toBe(k + 1);
  });

  it('accepts a zero border but not a negative one', () => {
    expect(validateConfig({ ...defaultConfig, border: 0 })).toEqual([]);
    expect(validateConfig({ ...defaultConfig, border: -1 })).toEqual([expect.stringMatching(/border/)]);
    expect(validateConfig({ ...defaultConfig, border: NaN })).toEqual([expect.stringMatching(/border/)]);
  });

  it('rejects more levels than there are layers', () => {
    expect(validateConfig({ ...defaultConfig, numberOfColorsOverride: 9 })).toEqual([]);
    expect(validateConfig({ ...defaultConfig, numberOfColorsOverride: 10 })).toEqual([expect.stringMatching(/between 2 and 9/)]);
    expect(validateConfig({ ...defaultConfig, numberOfColorsOverride: 1 })).toEqual([expect.stringMatching(/between 2 and 9/)]);
  });

  it('defaults to a one-cell border and names the file after the physical parameters', () => {
    const c = computeImageConfig(defaultConfig);
    expect(c.border).toBe(defaultConfig.cellSize);
    expect(computeImageConfig({ ...defaultConfig, border: 0 }).outputFilename).toBe('25px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_0border.stl');
    expect(c.outputFilename).toBe('25px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_1.20border.stl');
  });
});

describe('wallTop', () => {
  it('gives white one layer and black numberOfColors layers above the base', () => {
    const c = computeImageConfig(defaultConfig);
    expect(wallTop(c, 0)).toBeCloseTo(c.bottomThk + c.layerHeight, 12);
    expect(wallTop(c, c.numberOfColors - 1)).toBeCloseTo(c.bottomThk + c.maxHeight, 12);
  });

  it('only produces whole multiples of the layer height', () => {
    const c = computeImageConfig(presetConfigs.fuji);
    for (let k = 0; k < c.numberOfColors; k++) {
      const layers = (wallTop(c, k) - c.bottomThk) / c.layerHeight;
      expect(layers).toBeCloseTo(Math.round(layers), 9);
    }
  });

  it('puts isolation posts at least one floor width above the tallest wall, in whole layers', () => {
    for (const preset of Object.values(presetConfigs)) {
      const c = computeImageConfig(preset);
      const above = isolationPostTop(c) - wallTop(c, c.numberOfColors - 1);
      expect(above).toBeGreaterThanOrEqual(c.cellSize - c.wallWidth - 1e-9);
      expect(above).toBeLessThan(c.cellSize - c.wallWidth + c.layerHeight);
      const layers = (isolationPostTop(c) - c.bottomThk) / c.layerHeight;
      expect(layers).toBeCloseTo(Math.round(layers), 9);
    }
  });
});

describe('validateConfig', () => {
  it('accepts the default and every preset', () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
    for (const preset of Object.values(presetConfigs)) expect(validateConfig(preset)).toEqual([]);
  });

  it.each([
    [{ cellSize: 0 }, 'cellSize'],
    [{ wallWidth: -1 }, 'wallWidth'],
    [{ layerHeight: NaN }, 'layerHeight'],
    [{ widthInPixels: 10.5 }, 'widthInPixels'],
    [{ widthInPixels: 0 }, 'widthInPixels'],
    [{ wallWidth: 3 }, 'wallWidth must be smaller'],
    [{ numberOfColorsOverride: 300 }, 'numberOfColorsOverride'],
    [{ layerHeight: 1.5 }, 'height level'],
    [{ gamma: 0 }, 'gamma'],
  ])('rejects %j', (patch, message) => {
    const errors = validateConfig({ ...defaultConfig, ...patch });
    expect(errors.join('\n')).toContain(message);
  });
});

describe('format', () => {
  it('drops decimals for whole numbers and keeps two otherwise', () => {
    expect(format(2)).toBe('2');
    expect(format(2.1)).toBe('2.10');
    expect(format(0.875)).toBe('0.88');
  });
});
