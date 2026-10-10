import { describe, expect, it } from 'vitest';
import { DITHER_ALGORITHMS } from '../config';
import type { DitherAlgorithm } from '../config';
import { darknessLevel, levelsToGray, quantize } from '../dither';
import type { LevelMap } from '../dither';
import type { GrayImage } from '../image';
import { resizeToWidth } from '../image';
import { grayFromFunction, loadFixture } from '../../test/fixtures';

const opts = (algorithm: DitherAlgorithm, serpentine = true, gamma = 1) => ({ algorithm, serpentine, gamma });
const flat = (gray: number, size = 64) => grayFromFunction(size, size, () => gray);
const meanLevel = (m: LevelMap) => m.data.reduce((s, v) => s + v, 0) / m.data.length;

// Box blur with clamped edges; approximates what the eye does to a dithered pattern at a distance.
function blur(values: ArrayLike<number>, width: number, height: number, radius: number): Float64Array {
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          sum += values[yy * width + xx];
          n++;
        }
      }
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

function targetLevels(img: GrayImage, levels: number, gamma = 1): Float64Array {
  return Float64Array.from(img.data, (g) => darknessLevel(g, levels, gamma));
}

function rmse(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
}

describe('darknessLevel', () => {
  it('maps white to 0, black to the top level and is linear in between by default', () => {
    expect(darknessLevel(255, 17, 1)).toBe(0);
    expect(darknessLevel(0, 17, 1)).toBe(16);
    expect(darknessLevel(127.5, 17, 1)).toBeCloseTo(8, 12);
  });

  it('applies the gamma tone curve and clamps out of range input', () => {
    expect(darknessLevel(128, 17, 2.2)).toBeCloseTo((1 - (128 / 255) ** 2.2) * 16, 12);
    expect(darknessLevel(300, 17, 1)).toBe(0);
    expect(darknessLevel(-5, 17, 1)).toBe(16);
  });
});

describe('quantize', () => {
  it.each(DITHER_ALGORITHMS)('%s only outputs valid integer levels', (algorithm) => {
    const wave = loadFixture('great_wave');
    for (const levels of [2, 3, 17, 256]) {
      const m = quantize(wave, levels, opts(algorithm));
      expect(m.levels).toBe(levels);
      expect(m.width).toBe(wave.width);
      expect(m.height).toBe(wave.height);
      // Uint8Array guarantees integers >= 0; check the top end.
      expect(Math.max(...m.data)).toBeLessThan(levels);
    }
  });

  it.each(DITHER_ALGORITHMS)('%s keeps pure white and pure black clean', (algorithm) => {
    expect(quantize(flat(255), 17, opts(algorithm)).data.every((v) => v === 0)).toBe(true);
    expect(quantize(flat(0), 17, opts(algorithm)).data.every((v) => v === 16)).toBe(true);
  });

  it('without dithering rounds every pixel to the nearest level', () => {
    const ramp = grayFromFunction(256, 1, (x) => x);
    const m = quantize(ramp, 5, opts('none'));
    for (let x = 0; x < 256; x++) expect(m.data[x]).toBe(Math.round(darknessLevel(x, 5, 1)));
  });

  it.each(['floyd-steinberg', 'jarvis-judice-ninke'] as const)(
    '%s reproduces the exact mean tone of every flat gray',
    (algorithm) => {
      for (const levels of [2, 4, 17]) {
        for (let gray = 0; gray <= 255; gray += 5) {
          const m = quantize(flat(gray), levels, opts(algorithm));
          // Without diffusion, e.g. gray 200 at 17 levels would be off by up to half a level.
          expect(Math.abs(meanLevel(m) - darknessLevel(gray, levels, 1))).toBeLessThan(0.02 * (levels - 1) + 0.01);
        }
      }
    },
  );

  it('spreads a two-level halftone evenly instead of clumping', () => {
    for (const gray of [64, 128, 192]) {
      const m = quantize(flat(gray, 128), 2, opts('floyd-steinberg'));
      const want = darknessLevel(gray, 2, 1);
      // Every 8x8 block should already be close to the target density.
      for (let by = 0; by < 128; by += 8) {
        for (let bx = 0; bx < 128; bx += 8) {
          let dark = 0;
          for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) dark += m.data[y * 128 + x];
          expect(Math.abs(dark / 64 - want)).toBeLessThan(0.2);
        }
      }
    }
  });

  it('reproduces a smooth gradient column by column', () => {
    const ramp = grayFromFunction(64, 64, (x) => (255 * x) / 63);
    const m = quantize(ramp, 3, opts('floyd-steinberg'));
    let previous = Infinity;
    for (let x = 0; x < 64; x += 8) {
      let sum = 0;
      for (let y = 0; y < 64; y++) for (let dx = 0; dx < 8; dx++) sum += m.data[y * 64 + x + dx];
      const got = sum / (64 * 8);
      let want = 0;
      for (let dx = 0; dx < 8; dx++) want += darknessLevel((255 * (x + dx)) / 63, 3, 1);
      want /= 8;
      expect(Math.abs(got - want)).toBeLessThan(0.08);
      // Darkness falls monotonically as the ramp brightens.
      expect(got).toBeLessThanOrEqual(previous + 1e-9);
      previous = got;
    }
  });

  it('preserves far more of a real photo than plain posterization at the same level count', () => {
    // The point of dithering: seen from a distance (blurred), the few available heights should
    // still reproduce the original tones.
    const wave = resizeToWidth(loadFixture('great_wave'), 100);
    const levels = 4;
    const target = blur(targetLevels(wave, levels), wave.width, wave.height, 2);
    const errorOf = (algorithm: DitherAlgorithm) =>
      rmse(blur(quantize(wave, levels, opts(algorithm)).data, wave.width, wave.height, 2), target);
    const posterized = errorOf('none');
    expect(errorOf('floyd-steinberg')).toBeLessThan(posterized * 0.6);
    expect(errorOf('jarvis-judice-ninke')).toBeLessThan(posterized * 0.6);
    expect(errorOf('atkinson')).toBeLessThan(posterized);
  });

  it('only pushes error forward: rows are unaffected by anything below them', () => {
    const top = grayFromFunction(40, 30, (x, y) => (x * 7 + y * 13) % 256);
    const changed = grayFromFunction(40, 30, (x, y) => (y < 20 ? (x * 7 + y * 13) % 256 : 0));
    for (const algorithm of DITHER_ALGORITHMS) {
      const a = quantize(top, 6, opts(algorithm));
      const b = quantize(changed, 6, opts(algorithm));
      expect(Array.from(a.data.subarray(0, 20 * 40))).toEqual(Array.from(b.data.subarray(0, 20 * 40)));
    }
  });

  it('serpentine scanning changes the pattern but not the tone', () => {
    const gray = flat(100, 96);
    const raster = quantize(gray, 2, opts('floyd-steinberg', false));
    const serpentine = quantize(gray, 2, opts('floyd-steinberg', true));
    expect(Array.from(raster.data)).not.toEqual(Array.from(serpentine.data));
    expect(Math.abs(meanLevel(raster) - meanLevel(serpentine))).toBeLessThan(0.01);
  });

  it('is deterministic', () => {
    const wave = loadFixture('great_wave');
    expect(quantize(wave, 17, opts('floyd-steinberg')).data).toEqual(quantize(wave, 17, opts('floyd-steinberg')).data);
  });

  it('does not modify its input', () => {
    const wave = loadFixture('great_wave');
    const copy = wave.data.slice();
    quantize(wave, 3, opts('jarvis-judice-ninke'));
    expect(wave.data).toEqual(copy);
  });

  it('rejects unusable level counts', () => {
    expect(() => quantize(flat(0), 1, opts('none'))).toThrow();
    expect(() => quantize(flat(0), 257, opts('none'))).toThrow();
    expect(() => quantize(flat(0), 2.5, opts('none'))).toThrow();
  });
});

describe('levelsToGray', () => {
  it('maps levels back onto 255..0', () => {
    const img = levelsToGray({ width: 3, height: 1, levels: 3, data: Uint8Array.from([0, 1, 2]) });
    expect(Array.from(img.data)).toEqual([255, 127.5, 0]);
  });
});

describe('quantize with uneven tones', () => {
  // Three wall heights of 1, 4 and 8 layers: the middle one is 3/7 of the way to black.
  const tones = [0, 6 / 7, 2];
  const toneOpts = (algorithm: DitherAlgorithm) => ({ ...opts(algorithm), tones });
  const meanTone = (m: LevelMap) => m.data.reduce((s, v) => s + tones[v], 0) / m.data.length;

  it('picks the nearest tone without dithering', () => {
    const ramp = grayFromFunction(256, 1, (x) => 255 - x);
    const m = quantize(ramp, 3, toneOpts('none'));
    for (let x = 0; x < 256; x++) {
      const d = darknessLevel(255 - x, 3, 1);
      const nearest = tones.reduce((best, t, k) => (Math.abs(t - d) < Math.abs(tones[best] - d) ? k : best), 0);
      expect(m.data[x]).toBe(nearest);
    }
  });

  it.each(DITHER_ALGORITHMS.filter((a) => a !== 'none' && a !== 'atkinson'))('keeps the average tone of flat grays (%s)', (algorithm) => {
    for (const gray of [20, 64, 100, 128, 160, 200, 240]) {
      const m = quantize(flat(gray), 3, toneOpts(algorithm));
      expect(Math.abs(meanTone(m) - darknessLevel(gray, 3, 1))).toBeLessThan(0.02);
    }
  });

  it('reports its tones so previews show the real darkness', () => {
    const m = quantize(flat(128, 4), 3, toneOpts('floyd-steinberg'));
    expect(m.tones).toEqual(tones);
    const img = levelsToGray({ width: 3, height: 1, levels: 3, data: Uint8Array.from([0, 1, 2]), tones });
    expect(Array.from(img.data)).toEqual([255, expect.closeTo(255 * (1 - 3 / 7), 4), 0]);
  });

  it('rejects tones that do not span the scale in order', () => {
    expect(() => quantize(flat(0), 3, { ...opts('none'), tones: [0, 1] })).toThrow(/tones/);
    expect(() => quantize(flat(0), 3, { ...opts('none'), tones: [0, 2.5, 2] })).toThrow(/tones/);
    expect(() => quantize(flat(0), 3, { ...opts('none'), tones: [0.1, 1, 2] })).toThrow(/tones/);
  });
});
