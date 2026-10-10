import { describe, expect, it } from 'vitest';
import { computeImageConfig, defaultConfig, isolationPostTop, presetConfigs, wallTop } from '../config';
import type { ImageConfig } from '../config';
import type { LevelMap } from '../dither';
import { heightfieldFromBoxes } from '../heightfield';
import { SLICE_PLANE_CLEARANCE as C, layoutBoxes } from '../layout';
import type { Box } from '../layout';
import { meshHeightfield } from '../mesh';
import { analyzeMesh, mulberry32 } from '../../test/meshCheck';

const config = (patch: Partial<ImageConfig> = {}) => computeImageConfig({ ...defaultConfig, ...patch });

function levelMap(rows: number[][], levels = 17): LevelMap {
  return { width: rows[0].length, height: rows.length, levels, data: Uint8Array.from(rows.flat()) };
}

function randomLevels(cols: number, rows: number, levels: number, rand: () => number): LevelMap {
  return {
    width: cols, height: rows, levels,
    data: Uint8Array.from({ length: cols * rows }, () => Math.floor(rand() * levels)),
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const findBox = (boxes: Box[], match: Partial<Box>) =>
  boxes.filter((b) => (Object.keys(match) as (keyof Box)[]).every((k) => near(b[k], match[k]!)));

describe('layoutBoxes', () => {
  const c = config();
  const { cellSize: cs, wallWidth: ww, border } = c;

  it('sizes the base plate to the grid plus a border on every side', () => {
    const layout = layoutBoxes(levelMap([[0, 0, 0], [0, 0, 0]]), null, c);
    expect(layout.width).toBeCloseTo(3 * cs + 2 * border, 12);
    expect(layout.depth).toBeCloseTo(2 * cs + 2 * border, 12);
    expect(layout.boxes[0]).toEqual({ x0: 0, y0: 0, x1: layout.width, y1: layout.depth, z: c.bottomThk - C });
  });

  it('puts image row 0 at the back so the picture is upright when viewed from the front', () => {
    const layout = layoutBoxes(levelMap([[0], [0], [0]]), null, c);
    expect(layout.cellY[0]).toBeGreaterThan(layout.cellY[1]);
    expect(layout.cellY[2]).toBeCloseTo(border, 12);
    expect(layout.cellY[0] + cs).toBeCloseTo(layout.depth - border, 12);
  });

  it('places each left wall on the west edge of its cell with the height of its level', () => {
    const layout = layoutBoxes(levelMap([[0, 16], [5, 9]]), null, c);
    const cases = [[0, 0, 0], [1, 0, 16], [0, 1, 5], [1, 1, 9]];
    for (const [i, r, level] of cases) {
      const x0 = border + i * cs;
      const y0 = border + (1 - r) * cs;
      expect(findBox(layout.boxes, { x0, x1: x0 + ww, y0, y1: y0 + cs, z: wallTop(c, level) - C })).toHaveLength(1);
    }
    expect(layout.boxes).toHaveLength(5);
  });

  it('places each top wall along the back edge of its cell', () => {
    const layout = layoutBoxes(null, levelMap([[3, 7]]), c);
    for (const [i, level] of [[0, 3], [1, 7]]) {
      const x0 = border + i * cs;
      expect(findBox(layout.boxes, { x0, x1: x0 + cs, y0: border + cs - ww, y1: border + cs, z: wallTop(c, level) - C })).toHaveLength(1);
    }
  });

  it('matches the Dart height formula for every dither level', () => {
    // Dart: roundToLayerHeight((1 - val / 256) * (maxHeight - layerHeight)) + layerHeight, where
    // val is the dithered gray value of that level.
    for (const preset of Object.values(presetConfigs)) {
      const pc = computeImageConfig(preset);
      for (let k = 0; k < pc.numberOfColors; k++) {
        const val = 255 * (1 - k / (pc.numberOfColors - 1));
        const raw = (1 - val / 256) * (pc.maxHeight - pc.layerHeight);
        const dart = Math.round(raw / pc.layerHeight) * pc.layerHeight + pc.layerHeight;
        expect(wallTop(pc, k) - pc.bottomThk).toBeCloseTo(dart, 9);
      }
    }
  });

  it('raises every wall junction to the isolation post height when both images are used', () => {
    const layout = layoutBoxes(levelMap([[0, 4], [16, 2]]), levelMap([[1, 1], [9, 0]]), c);
    const posts = layout.boxes.filter((b) => near(b.x1 - b.x0, ww) && near(b.y1 - b.y0, ww));
    expect(posts).toHaveLength(4);
    for (const post of posts) expect(post.z).toBeCloseTo(isolationPostTop(c) - C, 12);
  });

  it('leaves out the top walls east of the last left wall and the left walls south of the last top wall', () => {
    const layout = layoutBoxes(levelMap([[3, 4], [5, 6]]), levelMap([[7, 8], [9, 10]]), c);
    const walls = layout.boxes.slice(1).filter((b) => !(near(b.x1 - b.x0, ww) && near(b.y1 - b.y0, ww)));
    // Left walls of row 0 and top walls of column 0 only.
    expect(walls).toHaveLength(4);
    const [y0Row0, y0Row1] = layout.cellY;
    expect(findBox(walls, { x0: border + cs, x1: border + cs + ww, y0: y0Row0 })).toHaveLength(1);
    expect(findBox(walls, { x0: border + cs, x1: border + 2 * cs })).toHaveLength(0);
    expect(findBox(walls, { y0: y0Row1, y1: y0Row1 + cs, x1: border + ww })).toHaveLength(0);
    expect(findBox(walls, { y0: y0Row1, y1: y0Row1 + cs, x1: border + cs + ww })).toHaveLength(0);
  });

  it('trims the plate so the border around the walls is even when both images are used', () => {
    for (const b of [border, 0, 0.5, 3]) {
      const layout = layoutBoxes(levelMap([[3, 4, 5], [5, 6, 7]]), levelMap([[7, 8, 9], [9, 10, 11]]), config({ border: b }));
      const walls = layout.boxes.slice(1);
      const minX = Math.min(...walls.map((w) => w.x0));
      const maxX = Math.max(...walls.map((w) => w.x1));
      const minY = Math.min(...walls.map((w) => w.y0));
      const maxY = Math.max(...walls.map((w) => w.y1));
      for (const margin of [minX, layout.width - maxX, minY, layout.depth - maxY]) {
        expect(margin).toBeCloseTo(b, 9);
      }
    }
  });

  it('adds no posts for a single image', () => {
    const layout = layoutBoxes(levelMap([[0, 16]]), null, c);
    expect(layout.boxes.some((b) => near(b.x1 - b.x0, ww) && near(b.y1 - b.y0, ww))).toBe(false);
  });

  it('without isolation posts only raises a junction to avoid diagonal-only contact', () => {
    const plain = config({ isolationPosts: false });
    // Cell (1, 1) is short; the wall running in from the west (top wall of cell (0, 1)) and the
    // one from the north (left wall of cell (1, 0)) are both tall.
    const horiz = levelMap([[0, 12], [0, 0]]);
    const vert = levelMap([[0, 0], [10, 0]]);
    const layout = layoutBoxes(horiz, vert, plain);
    const x0 = border + cs;
    const y1 = layout.cellY[1] + cs;
    const posts = findBox(layout.boxes, { x0, x1: x0 + ww, y0: y1 - ww, y1 });
    expect(posts).toHaveLength(1);
    expect(posts[0].z).toBeCloseTo(wallTop(plain, 10) - C, 12);
    // No other junction needed raising.
    expect(layout.boxes.filter((b) => near(b.x1 - b.x0, ww) && near(b.y1 - b.y0, ww))).toHaveLength(1);
  });

  it('keeps every top surface just below a whole layer so no slicer plane can land on it', () => {
    // Slicers cut through the middle of each layer. With matching layer heights the planes are
    // half a layer from every top; with any other layer height they can coincide exactly, which
    // makes Bambu Studio report "floating regions". The clearance rules out exact coincidence.
    const layout = layoutBoxes(levelMap([[0, 16], [5, 9]]), levelMap([[3, 7], [1, 12]]), c);
    for (const box of layout.boxes) {
      const layers = (box.z + C) / c.layerHeight;
      expect(layers).toBeCloseTo(Math.round(layers), 9);
      for (const sliceLayer of [0.06, 0.08, 0.1, 0.12]) {
        const planes = box.z / sliceLayer;
        expect(Math.abs(planes - Math.round(planes)) * sliceLayer).toBeGreaterThan(C / 2);
      }
    }
  });

  it('rejects images with different grids', () => {
    expect(() => layoutBoxes(levelMap([[0, 0]]), levelMap([[0], [0]]), c)).toThrow(/differ/);
    expect(() => layoutBoxes(null, null, c)).toThrow(/At least one/);
  });

  it.each([
    ['isolation posts', true],
    ['plain junctions', false],
  ])('always produces a watertight 2-manifold mesh (%s)', (_, isolationPosts) => {
    const rand = mulberry32(isolationPosts ? 1 : 2);
    for (let trial = 0; trial < 25; trial++) {
      const cols = 1 + Math.floor(rand() * 6);
      const rows = 1 + Math.floor(rand() * 6);
      const pc = config({ isolationPosts, numberOfColorsOverride: 2 + Math.floor(rand() * 6), border: [1.2, 0, 0.5][trial % 3] });
      const which = trial % 3;
      const horiz = which === 2 ? null : randomLevels(cols, rows, pc.numberOfColors, rand);
      const vert = which === 1 ? null : randomLevels(cols, rows, pc.numberOfColors, rand);
      const report = analyzeMesh(meshHeightfield(heightfieldFromBoxes(layoutBoxes(horiz, vert, pc).boxes)));
      expect(report.nonManifoldEdges).toBe(0);
      expect(report.misorientedEdges).toBe(0);
      expect(report.degenerateTriangles).toBe(0);
      expect(report.components).toBe(1);
      expect(report.eulerCharacteristic).toBe(2);
    }
  });
});
