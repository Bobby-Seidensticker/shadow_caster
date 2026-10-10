// Grayscale image with values from 0 (black) to 255 (white), row-major, row 0 at the top.
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export function createGray(width: number, height: number, fill = 0): GrayImage {
  const data = new Float32Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, data };
}

export function grayAt(img: GrayImage, x: number, y: number): number {
  return img.data[y * img.width + x];
}

// Converts RGBA bytes (canvas ImageData layout) to luma using the Rec. 601 weights, the same ones
// the Dart image package's grayscale() uses. Transparent pixels are composited over white so they
// cast no shadow.
export function grayFromRGBA(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  if (rgba.length < width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const out = createGray(width, height);
  for (let i = 0, p = 0; i < out.data.length; i++, p += 4) {
    const luma = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    const alpha = rgba[p + 3] / 255;
    out.data[i] = luma * alpha + 255 * (1 - alpha);
  }
  return out;
}

// Resamples with an area-averaging (box) filter: every destination pixel is the exact
// coverage-weighted mean of the source pixels under it. This is the right filter for large
// reductions (a 4000px photo down to 100 cells) where bilinear sampling aliases badly. Upscaling
// degrades gracefully to nearest-neighbour.
export function resizeArea(src: GrayImage, dstWidth: number, dstHeight: number): GrayImage {
  if (dstWidth < 1 || dstHeight < 1) {
    throw new Error(`Invalid resize target ${dstWidth}x${dstHeight}`);
  }
  if (dstWidth === src.width && dstHeight === src.height) {
    return { width: src.width, height: src.height, data: src.data.slice() };
  }
  // Horizontal pass: src.height rows of dstWidth.
  const tmp = new Float32Array(dstWidth * src.height);
  const xWeights = boxWeights(src.width, dstWidth);
  for (let y = 0; y < src.height; y++) {
    const row = y * src.width;
    for (let x = 0; x < dstWidth; x++) {
      const { start, weights } = xWeights[x];
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += src.data[row + start + k] * weights[k];
      tmp[y * dstWidth + x] = sum;
    }
  }
  // Vertical pass.
  const out = createGray(dstWidth, dstHeight);
  const yWeights = boxWeights(src.height, dstHeight);
  for (let y = 0; y < dstHeight; y++) {
    const { start, weights } = yWeights[y];
    for (let x = 0; x < dstWidth; x++) {
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += tmp[(start + k) * dstWidth + x] * weights[k];
      out.data[y * dstWidth + x] = sum;
    }
  }
  return out;
}

// For each destination pixel, the source pixels it covers and normalized coverage weights.
function boxWeights(srcSize: number, dstSize: number): { start: number; weights: Float64Array }[] {
  const scale = srcSize / dstSize;
  const result: { start: number; weights: Float64Array }[] = [];
  for (let d = 0; d < dstSize; d++) {
    const lo = d * scale;
    const hi = (d + 1) * scale;
    const start = Math.min(srcSize - 1, Math.floor(lo));
    const end = Math.min(srcSize, Math.max(start + 1, Math.ceil(hi - 1e-9)));
    const weights = new Float64Array(end - start);
    let total = 0;
    for (let s = start; s < end; s++) {
      const w = Math.max(0, Math.min(hi, s + 1) - Math.max(lo, s));
      weights[s - start] = w;
      total += w;
    }
    for (let k = 0; k < weights.length; k++) weights[k] /= total;
    result.push({ start, weights });
  }
  return result;
}

// Resizes to the given width, keeping the aspect ratio.
export function resizeToWidth(src: GrayImage, width: number): GrayImage {
  const height = Math.max(1, Math.round((width * src.height) / src.width));
  return resizeArea(src, width, height);
}

// Keeps `rows` rows centered vertically.
export function cropRowsCentered(src: GrayImage, rows: number): GrayImage {
  if (rows >= src.height) return src;
  const top = Math.floor((src.height - rows) / 2);
  return {
    width: src.width,
    height: rows,
    data: src.data.slice(top * src.width, (top + rows) * src.width),
  };
}
