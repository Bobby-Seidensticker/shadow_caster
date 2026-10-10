import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { grayFromRGBA } from '../core/image';
import type { GrayImage } from '../core/image';

// 160px wide grayscale versions of Hokusai's "The Great Wave off Kanagawa" and "Fine Wind, Clear
// Morning" (Red Fuji), the images the Dart version was tuned on. Both are public domain.
export type FixtureName = 'great_wave' | 'red_fuji';

export function fixturePath(name: FixtureName): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'fixtures', `${name}.png`);
}

export function loadFixture(name: FixtureName): GrayImage {
  const png = PNG.sync.read(readFileSync(fixturePath(name)));
  return grayFromRGBA(png.data, png.width, png.height);
}

export function grayFromFunction(width: number, height: number, f: (x: number, y: number) => number): GrayImage {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = f(x, y);
  }
  return { width, height, data };
}
