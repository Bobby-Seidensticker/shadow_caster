import { describe, expect, it } from 'vitest';
import { heightfieldFromBoxes } from '../heightfield';
import { meshHeightfield } from '../mesh';
import { decodeBinarySTL, encodeBinarySTL } from '../stl';

const box = meshHeightfield(heightfieldFromBoxes([{ x0: 1, y0: 2, x1: 4, y1: 6, z: 1.5 }]));

describe('encodeBinarySTL', () => {
  it('writes the standard binary layout', () => {
    const bytes = encodeBinarySTL(box, 'hello');
    const triangles = box.indices.length / 3;
    expect(bytes.byteLength).toBe(80 + 4 + 50 * triangles);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(80, true)).toBe(triangles);
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('hello');
    // Binary STL headers must not start with "solid" or some readers treat the file as ASCII.
    expect(String.fromCharCode(...bytes.subarray(0, 5))).not.toBe('solid');
  });

  it('round-trips every vertex exactly', () => {
    const { header, triangles } = decodeBinarySTL(encodeBinarySTL(box, 'round trip'));
    expect(header).toBe('round trip');
    expect(triangles).toHaveLength(box.indices.length / 3);
    triangles.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const v = box.indices[i * 3 + k];
        expect(t.vertices[k]).toEqual([box.positions[v * 3], box.positions[v * 3 + 1], box.positions[v * 3 + 2]]);
      }
    });
  });

  it('stores outward unit normals consistent with the winding', () => {
    const { triangles } = decodeBinarySTL(encodeBinarySTL(box));
    const centre = [2.5, 4, 0.75];
    for (const { normal, vertices } of triangles) {
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
      // Axis aligned box: every normal is a unit axis.
      expect(normal.map(Math.abs).sort()).toEqual([0, 0, 1]);
      // ...and points away from the centre.
      const mid = [0, 1, 2].map((k) => (vertices[0][k] + vertices[1][k] + vertices[2][k]) / 3);
      const outward = normal.reduce((s, n, k) => s + n * (mid[k] - centre[k]), 0);
      expect(outward).toBeGreaterThan(0);
    }
  });

  it('truncates long headers to 80 bytes', () => {
    const bytes = encodeBinarySTL(box, 'x'.repeat(200));
    expect(decodeBinarySTL(bytes).header).toBe('x'.repeat(80));
  });
});

describe('decodeBinarySTL', () => {
  it('rejects truncated files', () => {
    const bytes = encodeBinarySTL(box);
    expect(() => decodeBinarySTL(bytes.subarray(0, bytes.length - 1))).toThrow(/does not match/);
    expect(() => decodeBinarySTL(new Uint8Array(10))).toThrow(/too short/);
  });
});
