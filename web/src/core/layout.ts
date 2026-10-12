import { isolationPostTop, wallTop } from './config';
import type { ComputedImageConfig } from './config';
import type { LevelMap } from './dither';

// Every top surface is lowered by this much (mm) from its nominal height. Slicers cut each layer
// through its middle, and when a top face lies exactly on a cutting plane Bambu Studio produces
// spurious islands and reports "floating regions". That happens whenever the slicer's layer
// height doesn't divide the model's (e.g. 0.1 mm walls sliced at 0.08 mm puts a plane exactly on
// the 1.10 mm tops). 2 microns is far below anything printable but well above slicer tolerances.
export const SLICE_PLANE_CLEARANCE = 0.002;

// An axis-aligned block standing on the build plate (z = 0) with its top at z.
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
}

export interface Layout {
  cols: number;
  rows: number;
  // Overall footprint in mm.
  width: number;
  depth: number;
  // cellX[i] / cellY[r] are the min corner of column i / image row r. Image row 0 is the top of the
  // picture, which is the +Y (back) edge of the print.
  cellX: Float64Array;
  cellY: Float64Array;
  boxes: Box[];
}

// Lays out one cell per pixel:
//
//        +-+-----------+  <- cellY[r] + cellSize
//        |P|  top wall |  vert image: lit from +Y (behind), casts its shadow toward -Y
//        +-+-----------+
//        |L|           |
//        |e|   floor   |
//        |f|           |
//        |t|           |
//        +-+-----------+  <- cellY[r]
//        ^ cellX[i]
//
// The left wall belongs to the horizontal image and is lit from -X (the left), casting its shadow
// toward +X across the floor. Darker pixels get taller walls and therefore longer shadows. With
// the light at 45 degrees the shadow length equals the wall height, and the tallest wall equals
// the open floor width, so a black pixel's floor is fully shaded.
//
// P is the post where the left wall meets the top wall. Normally it is just the taller of the two,
// raised further only when the walls running into it from the west and north are both taller;
// otherwise those two would touch only along a vertical edge, which is not a valid (2-manifold)
// solid and confuses slicers.
//
// With isolationPosts, P is raised so that, under light from the left, it completely shades the
// top of this cell's top wall, and under light from the back, the top of its left wall. Otherwise
// how much of those wall tops is lit depends on the other image's wall height, ghosting it into
// this one (e.g. a diagonal mountainside showing up across a different picture). Each post is only
// as tall as its own taller wall needs: one open floor width above it, in whole layers.
export function layoutBoxes(
  horiz: LevelMap | null,
  vert: LevelMap | null,
  config: ComputedImageConfig,
): Layout {
  const maps = [horiz, vert].filter((m): m is LevelMap => m !== null);
  if (maps.length === 0) throw new Error('At least one image is required');
  const cols = maps[0].width;
  const rows = maps[0].height;
  for (const m of maps) {
    if (m.width !== cols || m.height !== rows) {
      throw new Error(`Image grids differ: ${m.width}x${m.height} vs ${cols}x${rows}`);
    }
  }

  const { cellSize: cs, wallWidth: ww, border, bottomThk } = config;
  // With both images the last column of top walls and last row of left walls are left out (see
  // below), so the grid ends at the far face of the last wall instead of a full cell later. Trim
  // the plate to match so the border is the same width on every side.
  const trim = horiz && vert ? cs - ww : 0;
  const width = cols * cs + 2 * border - trim;
  const depth = rows * cs + 2 * border - trim;
  const cellX = new Float64Array(cols);
  const cellY = new Float64Array(rows);
  for (let i = 0; i < cols; i++) cellX[i] = border + i * cs;
  for (let r = 0; r < rows; r++) cellY[r] = border - trim + (rows - 1 - r) * cs;

  // Wall top heights per cell, or 0 where that wall doesn't exist.
  const left = new Float64Array(cols * rows);
  const top = new Float64Array(cols * rows);
  for (let k = 0; k < cols * rows; k++) {
    if (horiz) left[k] = wallTop(config, horiz.data[k]) - SLICE_PLANE_CLEARANCE;
    if (vert) top[k] = wallTop(config, vert.data[k]) - SLICE_PLANE_CLEARANCE;
  }
  // With both images, the left walls run in columns and the top walls in rows, and together they
  // enclose the cells between them. Top walls east of the last column of left walls, and left walls
  // south of the last row of top walls, would only stick out past the grid as a ragged edge, so
  // they are left out: the vertical image shows cols - 1 columns and the horizontal one rows - 1 rows.
  if (horiz && vert) {
    for (let r = 0; r < rows; r++) top[r * cols + cols - 1] = 0;
    for (let i = 0; i < cols; i++) left[(rows - 1) * cols + i] = 0;
  }
  const at = (arr: Float64Array, i: number, r: number) =>
    i < 0 || r < 0 || i >= cols || r >= rows ? 0 : arr[r * cols + i];

  const isolate = config.isolationPosts && horiz !== null && vert !== null;
  const edgePost = isolationPostTop(config, config.bottomThk) - SLICE_PLANE_CLEARANCE;
  const tallestWall = config.bottomThk + config.maxHeight - SLICE_PLANE_CLEARANCE;
  const boxes: Box[] = [{ x0: 0, y0: 0, x1: width, y1: depth, z: bottomThk - SLICE_PLANE_CLEARANCE }];
  for (let r = 0; r < rows; r++) {
    const y0 = cellY[r];
    const y1 = y0 + cs;
    for (let i = 0; i < cols; i++) {
      const x0 = cellX[i];
      const x1 = x0 + cs;
      const l = left[r * cols + i];
      const t = top[r * cols + i];
      if (l > 0) boxes.push({ x0, y0, x1: x0 + ww, y1, z: l });
      if (t > 0) boxes.push({ x0, y0: y1 - ww, x1, y1, z: t });
      const fromWest = at(top, i - 1, r);
      const fromNorth = at(left, i, r - 1);
      const taller = Math.max(l, t);
      let post: number;
      if (horiz && vert && taller === 0) {
        // The far corner cell has no walls of its own. A fixed height keeps it from depending on
        // either image while still joining the two walls that meet there.
        post = Math.min(fromWest, fromNorth) > 0 ? tallestWall : 0;
      } else if (isolate) {
        post = isolationPostTop(config, taller + SLICE_PLANE_CLEARANCE) - SLICE_PLANE_CLEARANCE;
      } else if (horiz && vert && (l === 0 || t === 0)) {
        // In the last column (no top wall) or last row (no left wall), the strip where the missing
        // wall would be is bare plate, and the neighbouring cell's wall of the other image can
        // shade it. A post one floor width tall shades that strip completely under either light.
        post = edgePost;
      } else {
        post = Math.max(taller, Math.min(fromWest, fromNorth));
      }
      if (post > Math.max(l, t)) boxes.push({ x0, y0: y1 - ww, x1: x0 + ww, y1, z: post });
    }
  }
  return { cols, rows, width, depth, cellX, cellY, boxes };
}
