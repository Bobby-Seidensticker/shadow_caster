import type { Heightfield } from './heightfield';
import type { GrayImage } from './image';
import type { Layout } from './layout';

// Where the light comes from. 'west' (-X, the left edge) lights the horizontal image; 'north'
// (+Y, the back edge) lights the vertical image.
export type LightDirection = 'west' | 'north';

export interface ShadowMap {
  direction: LightDirection;
  // For each heightfield rect, how far the shadow reaches into it (mm) from its lit-side edge:
  // the west edge for 'west' light, the north edge for 'north' light.
  shadow: Float64Array;
}

// Casts parallel light from `direction` at `elevationDeg` above the horizon across the heightfield
// and records the exact extent of shadow on every top face. Shadows are uniform across each rect
// perpendicular to the light, so one length per rect is exact.
export function castShadows(hf: Heightfield, direction: LightDirection, elevationDeg = 45): ShadowMap {
  const slope = Math.tan((elevationDeg * Math.PI) / 180);
  const { nx, ny, xs, ys, z } = hf;
  const shadow = new Float64Array(nx * ny);
  if (direction === 'west') {
    for (let iy = 0; iy < ny; iy++) {
      // Height of the shadow boundary ("ceiling") at the current x.
      let ceiling = 0;
      for (let ix = 0; ix < nx; ix++) {
        const k = iy * nx + ix;
        const span = xs[ix + 1] - xs[ix];
        shadow[k] = Math.min(span, Math.max(0, (ceiling - z[k]) / slope));
        ceiling = Math.max(ceiling - span * slope, z[k]);
      }
    }
  } else {
    for (let ix = 0; ix < nx; ix++) {
      let ceiling = 0;
      for (let iy = ny - 1; iy >= 0; iy--) {
        const k = iy * nx + ix;
        const span = ys[iy + 1] - ys[iy];
        shadow[k] = Math.min(span, Math.max(0, (ceiling - z[k]) / slope));
        ceiling = Math.max(ceiling - span * slope, z[k]);
      }
    }
  }
  return { direction, shadow };
}

// Index of the rect [lines[i], lines[i + 1]) containing v, clamped to the grid.
function rectContaining(lines: Float64Array, v: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid + 1] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Lit fraction of the region [x0, x1] x [y0, y1] seen from directly above. Surfaces higher than
// maxLitZ count as dark even when lit, e.g. wall tops printed in black filament over a white base.
export function litFraction(
  hf: Heightfield,
  map: ShadowMap,
  x0: number, x1: number, y0: number, y1: number,
  maxLitZ = Infinity,
): number {
  const { xs, ys, nx } = hf;
  let lit = 0;
  for (let iy = rectContaining(ys, y0); iy < hf.ny && ys[iy] < y1; iy++) {
    const ry0 = ys[iy], ry1 = ys[iy + 1];
    for (let ix = rectContaining(xs, x0); ix < nx && xs[ix] < x1; ix++) {
      const rx0 = xs[ix], rx1 = xs[ix + 1];
      if (hf.z[iy * nx + ix] > maxLitZ) continue;
      const s = map.shadow[iy * nx + ix];
      // Lit sub-rectangle of this rect.
      const lx0 = map.direction === 'west' ? rx0 + s : rx0;
      const ly1 = map.direction === 'north' ? ry1 - s : ry1;
      const w = Math.min(rx1, x1) - Math.max(lx0, x0);
      const h = Math.min(ly1, y1) - Math.max(ry0, y0);
      if (w > 0 && h > 0) lit += w * h;
    }
  }
  return lit / ((x1 - x0) * (y1 - y0));
}

// Apparent brightness (0 = fully shaded, 255 = fully lit) of every cell when viewed from above,
// i.e. the image the print shows under this light. See litFraction for maxLitZ.
export function cellBrightness(
  hf: Heightfield, map: ShadowMap, layout: Layout, cellSize: number, maxLitZ = Infinity,
): GrayImage {
  const { cols, rows, cellX, cellY } = layout;
  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      data[r * cols + i] = 255 * litFraction(hf, map, cellX[i], cellX[i] + cellSize, cellY[r], cellY[r] + cellSize, maxLitZ);
    }
  }
  return { width: cols, height: rows, data };
}

// Rasterizes the top-down view of the whole print: 255 where lit, 0 in shadow. Row 0 is the back
// (+Y) edge so the result is upright like the source image.
export function renderShadow(hf: Heightfield, map: ShadowMap, pxPerMm: number): GrayImage {
  const { xs, ys, nx, ny } = hf;
  const width = Math.max(1, Math.round((xs[nx] - xs[0]) * pxPerMm));
  const height = Math.max(1, Math.round((ys[ny] - ys[0]) * pxPerMm));
  const data = new Float32Array(width * height);
  const colRect = new Int32Array(width);
  const colX = new Float64Array(width);
  for (let px = 0; px < width; px++) {
    colX[px] = xs[0] + (px + 0.5) / pxPerMm;
    colRect[px] = rectContaining(xs, colX[px]);
  }
  for (let py = 0; py < height; py++) {
    const y = ys[ny] - (py + 0.5) / pxPerMm;
    const iy = rectContaining(ys, y);
    for (let px = 0; px < width; px++) {
      const ix = colRect[px];
      const s = map.shadow[iy * nx + ix];
      const inShadow = map.direction === 'west'
        ? colX[px] < xs[ix] + s
        : y > ys[iy + 1] - s;
      data[py * width + px] = inShadow ? 0 : 255;
    }
  }
  return { width, height, data };
}
