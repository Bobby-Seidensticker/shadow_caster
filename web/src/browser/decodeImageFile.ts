import { grayFromRGBA } from '../core/image';
import type { GrayImage } from '../core/image';

// Images are decoded once at up to this width and kept, so changing the grid width doesn't need
// another decode. It is far above any sensible grid width, so the area-averaging resize in the
// core still does the real downscaling.
export const MAX_DECODE_WIDTH = 2000;

// Decodes an uploaded image into grayscale using the browser's codecs.
export async function decodeImageFile(file: Blob, maxWidth = MAX_DECODE_WIDTH): Promise<GrayImage> {
  let bitmap = await createImageBitmap(file);
  if (bitmap.width > maxWidth) {
    const resizeHeight = Math.max(1, Math.round((bitmap.height * maxWidth) / bitmap.width));
    bitmap.close();
    bitmap = await createImageBitmap(file, { resizeWidth: maxWidth, resizeHeight, resizeQuality: 'high' });
  }
  const { width, height } = bitmap;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return grayFromRGBA(data, width, height);
}
