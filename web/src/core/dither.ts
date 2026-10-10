import type { DitherAlgorithm } from './config';
import type { GrayImage } from './image';

// Per-cell quantized darkness: 0 = white (shortest wall) ... levels - 1 = black (tallest wall).
export interface LevelMap {
  width: number;
  height: number;
  levels: number;
  data: Uint8Array;
  // Darkness of each level on [0, levels - 1] when they aren't evenly spaced (see QuantizeOptions).
  tones?: readonly number[];
}

export interface QuantizeOptions {
  algorithm: DitherAlgorithm;
  serpentine: boolean;
  gamma: number;
  // Darkness of each level on the scale [0, levels - 1], ascending from 0 to levels - 1. Defaults
  // to evenly spaced (level k has darkness k). Each pixel takes the nearest level and diffuses the
  // remaining error, so the average tone stays right whatever the spacing.
  tones?: readonly number[];
}

// [dx, dy, weight]; weights are divided by the kernel's divisor.
type Kernel = { taps: [number, number, number][]; divisor: number };

const KERNELS: Record<Exclude<DitherAlgorithm, 'none'>, Kernel> = {
  'floyd-steinberg': {
    taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
    divisor: 16,
  },
  // Only diffuses 6/8 of the error, trading tone accuracy in the extremes for crisper contrast.
  atkinson: {
    taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]],
    divisor: 8,
  },
  'jarvis-judice-ninke': {
    taps: [
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
    ],
    divisor: 48,
  },
};

// Target darkness of a gray value on the continuous scale [0, levels - 1].
export function darknessLevel(gray: number, levels: number, gamma: number): number {
  const g = Math.min(1, Math.max(0, gray / 255));
  return (1 - Math.pow(g, gamma)) * (levels - 1);
}

// Quantizes an image to `levels` evenly spaced darkness levels with optional error diffusion.
export function quantize(img: GrayImage, levels: number, options: QuantizeOptions): LevelMap {
  if (!Number.isInteger(levels) || levels < 2 || levels > 256) {
    throw new Error(`levels must be an integer in [2, 256], got ${levels}`);
  }
  const { width, height } = img;
  const max = levels - 1;
  const { tones } = options;
  if (tones && (tones.length !== levels || tones[0] !== 0 || tones[max] !== max || tones.some((t, k) => k > 0 && t <= tones[k - 1]))) {
    throw new Error(`tones must ascend from 0 to ${max} with one entry per level`);
  }
  const work = new Float32Array(width * height);
  for (let i = 0; i < work.length; i++) work[i] = darknessLevel(img.data[i], levels, options.gamma);

  const out = new Uint8Array(width * height);
  const kernel = options.algorithm === 'none' ? null : KERNELS[options.algorithm];
  if (options.algorithm !== 'none' && !kernel) {
    throw new Error(`Unknown dither algorithm ${options.algorithm}`);
  }

  for (let y = 0; y < height; y++) {
    const reverse = options.serpentine && y % 2 === 1;
    for (let i = 0; i < width; i++) {
      const x = reverse ? width - 1 - i : i;
      const idx = y * width + x;
      // Clamp before quantizing so error that can't be represented (pushing past pure black or
      // white) is dropped instead of snowballing into streaks.
      const value = Math.min(max, Math.max(0, work[idx]));
      let q = Math.round(value);
      if (tones) {
        q = 0;
        while (q < max && tones[q + 1] - value < value - tones[q]) q++;
      }
      out[idx] = q;
      if (!kernel) continue;
      const error = value - (tones ? tones[q] : q);
      if (error === 0) continue;
      for (const [dx, dy, w] of kernel.taps) {
        const nx = reverse ? x - dx : x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        work[ny * width + nx] += (error * w) / kernel.divisor;
      }
    }
  }
  return tones ? { width, height, levels, data: out, tones } : { width, height, levels, data: out };
}

// Converts levels back to gray values (0..255) for previews.
export function levelsToGray(map: LevelMap): GrayImage {
  const data = new Float32Array(map.data.length);
  const max = map.levels - 1;
  for (let i = 0; i < data.length; i++) data[i] = 255 * (1 - (map.tones?.[map.data[i]] ?? map.data[i]) / max);
  return { width: map.width, height: map.height, data };
}
