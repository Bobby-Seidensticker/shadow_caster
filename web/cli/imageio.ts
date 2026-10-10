import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { grayFromRGBA } from '../src/core/image';
import type { GrayImage } from '../src/core/image';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

// Decodes a PNG or JPEG into grayscale. Format is sniffed from the file contents.
export function decodeImage(bytes: Uint8Array, name = 'image'): GrayImage {
  if (startsWith(bytes, PNG_MAGIC)) {
    const png = PNG.sync.read(Buffer.from(bytes));
    return grayFromRGBA(png.data, png.width, png.height);
  }
  if (startsWith(bytes, JPEG_MAGIC)) {
    const img = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 400,
      maxMemoryUsageInMB: 4096,
    });
    return grayFromRGBA(img.data, img.width, img.height);
  }
  throw new Error(`${name}: unsupported image format (expected PNG or JPEG)`);
}

export function readImageFile(path: string): GrayImage {
  return decodeImage(readFileSync(path), path);
}

export function encodeGrayPNG(img: GrayImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(img.data[i])));
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function writeGrayPNG(path: string, img: GrayImage): void {
  writeFileSync(path, encodeGrayPNG(img));
}
