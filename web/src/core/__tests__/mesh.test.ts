import { describe, expect, it } from 'vitest';
import { heightfieldFromBoxes, heightfieldVolume } from '../heightfield';
import type { Heightfield } from '../heightfield';
import type { Box } from '../layout';
import { meshHeightfield } from '../mesh';
import { analyzeMesh, mulberry32 } from '../../test/meshCheck';

function expectWatertight(hf: Heightfield) {
  const mesh = meshHeightfield(hf);
  const report = analyzeMesh(mesh);
  expect(report.nonManifoldEdges).toBe(0);
  expect(report.misorientedEdges).toBe(0);
  expect(report.degenerateTriangles).toBe(0);
  expect(report.components).toBe(1);
  // A closed surface without handles (a deformed sphere) has V - E + F = 2.
  expect(report.eulerCharacteristic).toBe(2);
  expect(report.volume).toBeCloseTo(heightfieldVolume(hf), 3);
  return { mesh, report };
}

function gridHeightfield(heights: number[][], cell = 1): Heightfield {
  const ny = heights.length;
  const nx = heights[0].length;
  const z = new Float64Array(nx * ny);
  // Row 0 of the literal is the top (+Y) row, like an image.
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) z[(ny - 1 - r) * nx + c] = heights[r][c];
  return {
    xs: Float64Array.from({ length: nx + 1 }, (_, i) => i * cell),
    ys: Float64Array.from({ length: ny + 1 }, (_, i) => i * cell),
    nx, ny, z,
  };
}

describe('heightfieldFromBoxes', () => {
  it('takes the tallest box covering each rect', () => {
    const hf = heightfieldFromBoxes([
      { x0: 0, y0: 0, x1: 4, y1: 2, z: 1 },
      { x0: 1, y0: 0, x1: 2, y1: 2, z: 3 },
      { x0: 1.5, y0: 1, x1: 4, y1: 2, z: 2 },
    ]);
    expect(Array.from(hf.xs)).toEqual([0, 1, 1.5, 2, 4]);
    expect(Array.from(hf.ys)).toEqual([0, 1, 2]);
    expect(Array.from(hf.z)).toEqual([1, 3, 3, 1, 1, 3, 3, 2]);
  });

  it('merges coordinates that differ only by floating point noise', () => {
    const hf = heightfieldFromBoxes([
      { x0: 0, y0: 0, x1: 0.3, y1: 1, z: 1 },
      { x0: 0.1 + 0.2, y0: 0, x1: 1, y1: 1, z: 2 },
    ]);
    expect(hf.nx).toBe(2);
    expect(Array.from(hf.z)).toEqual([1, 2]);
  });

  it('rejects degenerate boxes', () => {
    expect(() => heightfieldFromBoxes([{ x0: 0, y0: 0, x1: 0, y1: 1, z: 1 }])).toThrow(/Degenerate/);
    expect(() => heightfieldFromBoxes([{ x0: 0, y0: 0, x1: 1, y1: 1, z: 0 }])).toThrow(/Degenerate/);
  });
});

describe('meshHeightfield', () => {
  it('turns a single rect into a closed box', () => {
    const { mesh, report } = expectWatertight(gridHeightfield([[2]]));
    // 2 top + 4 walls x 2 + 4 bottom fan triangles.
    expect(report.triangles).toBe(14);
    expect(report.min).toEqual([0, 0, 0]);
    expect(report.max).toEqual([1, 1, 2]);
    expect(mesh.positions.length / 3).toBe(9);
  });

  it('winds triangles outward', () => {
    const { report } = expectWatertight(gridHeightfield([[1, 3], [2, 2]]));
    expect(report.volume).toBeGreaterThan(0);
  });

  it('splits vertical edges where several heights meet so there are no T-junctions', () => {
    // The centre grid point has four different heights around it.
    expectWatertight(gridHeightfield([[1, 4], [2, 3]]));
    expectWatertight(gridHeightfield([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
  });

  it('skips walls between equal neighbours', () => {
    const flat = analyzeMesh(meshHeightfield(gridHeightfield([[1, 1, 1], [1, 1, 1]])));
    const box = analyzeMesh(meshHeightfield(gridHeightfield([[1]])));
    // Same outline, so only the extra top triangles and perimeter subdivisions differ.
    expect(flat.triangles).toBe(6 * 2 + (3 + 2 + 3 + 2) * 2 + 10);
    expect(box.triangles).toBe(14);
  });

  it('stays watertight for random heightfields', () => {
    const rand = mulberry32(42);
    for (let trial = 0; trial < 40; trial++) {
      const nx = 1 + Math.floor(rand() * 7);
      const ny = 1 + Math.floor(rand() * 7);
      const levels = 1 + Math.floor(rand() * 5);
      const heights = Array.from({ length: ny }, () =>
        Array.from({ length: nx }, () => 0.5 + Math.floor(rand() * levels) * 0.25));
      const hf = gridHeightfield(heights);
      const report = analyzeMesh(meshHeightfield(hf));
      // Arbitrary heightfields can contain diagonal-only contacts (see the test below), so only
      // require a closed, consistently wound surface with the right volume here.
      expect(report.unbalancedEdges).toBe(0);
      expect(report.degenerateTriangles).toBe(0);
      expect(report.volume).toBeCloseTo(heightfieldVolume(hf), 6);
    }
  });

  it('flags diagonal-only contact as non-manifold, which is why the layout avoids it', () => {
    // Two tall rects touching only along a vertical edge pinch the surface: four faces share it.
    const report = analyzeMesh(meshHeightfield(gridHeightfield([[3, 1], [1, 3]])));
    expect(report.unbalancedEdges).toBe(0);
    expect(report.nonManifoldEdges).toBeGreaterThan(0);
  });

  it('handles non-uniform grids from overlapping boxes', () => {
    const rand = mulberry32(9);
    for (let trial = 0; trial < 30; trial++) {
      const boxes: Box[] = [{ x0: 0, y0: 0, x1: 10, y1: 10, z: 0.6 }];
      for (let b = 0; b < 8; b++) {
        const x0 = rand() * 9;
        const y0 = rand() * 9;
        boxes.push({ x0, y0, x1: x0 + 0.2 + rand(), y1: y0 + 0.2 + rand(), z: 0.6 + rand() * 3 });
      }
      const hf = heightfieldFromBoxes(boxes);
      const report = analyzeMesh(meshHeightfield(hf));
      expect(report.unbalancedEdges).toBe(0);
      expect(report.degenerateTriangles).toBe(0);
      expect(report.volume).toBeCloseTo(heightfieldVolume(hf), 3);
    }
  });

  it('requires every rect to have material', () => {
    expect(() => meshHeightfield(gridHeightfield([[1, 0]]))).toThrow(/positive height/);
  });
});
