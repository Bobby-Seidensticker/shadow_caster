import { describe, expect, it } from 'vitest';
import { cropRowsCentered, grayFromRGBA, resizeArea, resizeToWidth } from '../image';
import { grayFromFunction, loadFixture } from '../../test/fixtures';
import { mulberry32 } from '../../test/meshCheck';

const mean = (data: Float32Array) => data.reduce((s, v) => s + v, 0) / data.length;

describe('grayFromRGBA', () => {
  it('uses Rec. 601 luma', () => {
    const img = grayFromRGBA(
      [255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
      5, 1,
    );
    expect(Array.from(img.data)).toEqual([255, 0, 0.299 * 255, 0.587 * 255, 0.114 * 255].map((v) => Math.fround(v)));
  });

  it('composites transparency over white so it casts no shadow', () => {
    const img = grayFromRGBA([0, 0, 0, 0, 0, 0, 0, 128], 2, 1);
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBeCloseTo(255 * (1 - 128 / 255), 4);
  });

  it('rejects short buffers', () => {
    expect(() => grayFromRGBA([0, 0, 0, 255], 2, 1)).toThrow(/RGBA/);
  });
});

describe('resizeArea', () => {
  it('averages exact blocks for integer reductions', () => {
    const src = grayFromFunction(4, 4, (x, y) => y * 4 + x);
    const out = resizeArea(src, 2, 2);
    // Each output pixel is the mean of a 2x2 block.
    expect(Array.from(out.data)).toEqual([2.5, 4.5, 10.5, 12.5]);
  });

  it('weights partially covered pixels for fractional reductions', () => {
    const src = grayFromFunction(3, 1, (x) => [0, 90, 180][x]);
    const out = resizeArea(src, 2, 1);
    // Output 0 covers source [0, 1.5): pixel 0 fully and half of pixel 1.
    expect(out.data[0]).toBeCloseTo((0 + 0.5 * 90) / 1.5, 4);
    expect(out.data[1]).toBeCloseTo((0.5 * 90 + 180) / 1.5, 4);
  });

  it('preserves the mean brightness of arbitrary images and sizes', () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 20; trial++) {
      const w = 5 + Math.floor(rand() * 60);
      const h = 5 + Math.floor(rand() * 60);
      const src = grayFromFunction(w, h, () => rand() * 255);
      const out = resizeArea(src, 1 + Math.floor(rand() * w), 1 + Math.floor(rand() * h));
      expect(mean(out.data)).toBeCloseTo(mean(src.data), 2);
    }
  });

  it('keeps flat images flat and stays within the source range', () => {
    const flat = resizeArea(grayFromFunction(97, 41, () => 77), 13, 7);
    for (const v of flat.data) expect(v).toBeCloseTo(77, 4);
    const rand = mulberry32(3);
    const noisy = resizeArea(grayFromFunction(50, 50, () => rand() * 255), 17, 9);
    for (const v of noisy.data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('upscales by replicating pixels', () => {
    const out = resizeArea(grayFromFunction(2, 1, (x) => (x ? 200 : 10)), 4, 2);
    expect(Array.from(out.data)).toEqual([10, 10, 200, 200, 10, 10, 200, 200]);
  });

  it('does not alias fine detail like point sampling does', () => {
    // A 1px checkerboard reduced 4x must become flat mid-gray, not a moire of black and white.
    const checker = grayFromFunction(400, 400, (x, y) => ((x + y) % 2 ? 255 : 0));
    const out = resizeArea(checker, 100, 100);
    for (const v of out.data) expect(v).toBeCloseTo(127.5, 3);
  });

  it('resizes a real photo to the grid width keeping the aspect ratio', () => {
    const wave = loadFixture('great_wave');
    const out = resizeToWidth(wave, 50);
    expect(out.width).toBe(50);
    expect(out.height).toBe(Math.round((50 * wave.height) / wave.width));
    expect(mean(out.data)).toBeCloseTo(mean(wave.data), 0);
  });
});

describe('cropRowsCentered', () => {
  it('keeps the middle rows', () => {
    const src = grayFromFunction(2, 6, (_, y) => y);
    const out = cropRowsCentered(src, 2);
    expect(out.height).toBe(2);
    expect(Array.from(out.data)).toEqual([2, 2, 3, 3]);
  });

  it('is a no-op when the image is already short enough', () => {
    const src = grayFromFunction(2, 3, () => 1);
    expect(cropRowsCentered(src, 5)).toBe(src);
  });
});
