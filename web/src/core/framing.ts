import { createGray, resizeArea } from './image';
import type { GrayImage } from './image';

export type ImageSlot = 'horiz' | 'vert';

// A rectangle in source pixels. (x0, y0) is the top-left corner and (x1, y1) the bottom-right one,
// both on pixel edges, so the whole of an 800x600 image is 0,0 -> 800,600.
export interface CropRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// How two images with different aspect ratios share one grid. Images are only ever cropped, never
// stretched.
export interface Framing {
  // The image that is used whole. Its aspect ratio sets the grid's.
  lead: ImageSlot;
  // The region of the other image to use, or null for all of it. Within it, the largest rectangle
  // with the lead's aspect ratio is used, centred.
  crop: CropRect | null;
}

export const defaultFraming: Framing = { lead: 'horiz', crop: null };

export function otherSlot(slot: ImageSlot): ImageSlot {
  return slot === 'horiz' ? 'vert' : 'horiz';
}

export function fullRect(img: { width: number; height: number }): CropRect {
  return { x0: 0, y0: 0, x1: img.width, y1: img.height };
}

// The crop actually used for an image of the given size: `crop` (default: the whole image) rounded
// to whole pixels and clamped to the image, then narrowed to the largest rectangle of width/height
// `aspect` that fits inside it, centred.
export function fitCrop(
  img: { width: number; height: number },
  aspect: number,
  crop: CropRect | null,
): CropRect {
  const c = crop ?? fullRect(img);
  if (![c.x0, c.y0, c.x1, c.y1].every(Number.isFinite)) throw new Error('Crop corners must be numbers');
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error(`Invalid aspect ratio ${aspect}`);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const x0 = clamp(Math.min(c.x0, c.x1), img.width);
  const x1 = clamp(Math.max(c.x0, c.x1), img.width);
  const y0 = clamp(Math.min(c.y0, c.y1), img.height);
  const y1 = clamp(Math.max(c.y0, c.y1), img.height);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 1 || rh < 1) throw new Error(`Crop ${x0},${y0} -> ${x1},${y1} is empty within the ${img.width}x${img.height} image`);
  let w = rw;
  let h = rh;
  if (rw / rh > aspect) w = Math.max(1, Math.min(rw, Math.round(rh * aspect)));
  else h = Math.max(1, Math.min(rh, Math.round(rw / aspect)));
  const left = x0 + Math.floor((rw - w) / 2);
  const top = y0 + Math.floor((rh - h) / 2);
  return { x0: left, y0: top, x1: left + w, y1: top + h };
}

// Copies a whole-pixel rectangle out of an image.
export function cropImage(src: GrayImage, rect: CropRect): GrayImage {
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  const out = createGray(width, height);
  for (let y = 0; y < height; y++) {
    const start = (rect.y0 + y) * src.width + rect.x0;
    out.data.set(src.data.subarray(start, start + width), y * width);
  }
  return out;
}

// A small picture of where a crop falls: the image scaled to fit within maxSize, with everything
// outside the crop washed out and a dark outline just outside it.
export function cropOverlay(src: GrayImage, rect: CropRect, maxSize = 480): GrayImage {
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  const out = resizeArea(src, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)));
  const sx = out.width / src.width;
  const sy = out.height / src.height;
  const x0 = Math.round(rect.x0 * sx);
  const x1 = Math.round(rect.x1 * sx);
  const y0 = Math.round(rect.y0 * sy);
  const y1 = Math.round(rect.y1 * sy);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inside) continue;
      const k = y * out.width + x;
      const onOutline = x >= x0 - 2 && x < x1 + 2 && y >= y0 - 2 && y < y1 + 2;
      out.data[k] = onOutline ? 0 : 255 - (255 - out.data[k]) * 0.3;
    }
  }
  return out;
}
