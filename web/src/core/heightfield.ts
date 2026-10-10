import type { Box } from './layout';

// A 2.5D solid on a rectilinear grid: rect (ix, iy) spans [xs[ix], xs[ix+1]] x [ys[iy], ys[iy+1]]
// and is solid from z = 0 up to z[iy * nx + ix]. Outside the grid is empty.
export interface Heightfield {
  xs: Float64Array;
  ys: Float64Array;
  nx: number;
  ny: number;
  z: Float64Array;
}

// Coordinates closer than this (mm) are treated as the same grid line.
const SNAP = 1e-6;

function gridLines(values: number[]): Float64Array {
  values.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || v - out[out.length - 1] > SNAP) out.push(v);
  }
  return Float64Array.from(out);
}

// Index of the grid line nearest to v.
function lineIndex(lines: Float64Array, v: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] < v - SNAP) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Rasterizes the union of the boxes: each rect gets the height of the tallest box covering it.
export function heightfieldFromBoxes(boxes: Box[]): Heightfield {
  const xValues: number[] = [];
  const yValues: number[] = [];
  for (const b of boxes) {
    if (!(b.x1 > b.x0 && b.y1 > b.y0 && b.z > 0)) {
      throw new Error(`Degenerate box ${JSON.stringify(b)}`);
    }
    xValues.push(b.x0, b.x1);
    yValues.push(b.y0, b.y1);
  }
  const xs = gridLines(xValues);
  const ys = gridLines(yValues);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const z = new Float64Array(nx * ny);
  for (const b of boxes) {
    const ix0 = lineIndex(xs, b.x0);
    const ix1 = lineIndex(xs, b.x1);
    const iy0 = lineIndex(ys, b.y0);
    const iy1 = lineIndex(ys, b.y1);
    for (let iy = iy0; iy < iy1; iy++) {
      const row = iy * nx;
      for (let ix = ix0; ix < ix1; ix++) {
        if (b.z > z[row + ix]) z[row + ix] = b.z;
      }
    }
  }
  return { xs, ys, nx, ny, z };
}

export function heightAt(hf: Heightfield, ix: number, iy: number): number {
  return ix < 0 || iy < 0 || ix >= hf.nx || iy >= hf.ny ? 0 : hf.z[iy * hf.nx + ix];
}

export function heightfieldVolume(hf: Heightfield): number {
  let v = 0;
  for (let iy = 0; iy < hf.ny; iy++) {
    const dy = hf.ys[iy + 1] - hf.ys[iy];
    for (let ix = 0; ix < hf.nx; ix++) {
      v += (hf.xs[ix + 1] - hf.xs[ix]) * dy * hf.z[iy * hf.nx + ix];
    }
  }
  return v;
}
