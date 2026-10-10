import type { Mesh } from './mesh';

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

// Encodes a mesh as binary STL (millimetres).
export function encodeBinarySTL(mesh: Mesh, header = 'Shadow Caster'): Uint8Array {
  const { positions: p, indices } = mesh;
  const count = indices.length / 3;
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + count * TRIANGLE_BYTES);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let i = 0; i < Math.min(header.length, HEADER_BYTES); i++) {
    bytes[i] = header.charCodeAt(i) & 0x7f;
  }
  view.setUint32(HEADER_BYTES, count, true);

  let offset = HEADER_BYTES + 4;
  for (let t = 0; t < count; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    offset += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(offset, p[v], true);
      view.setFloat32(offset + 4, p[v + 1], true);
      view.setFloat32(offset + 8, p[v + 2], true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return bytes;
}

export interface STLTriangle {
  normal: [number, number, number];
  vertices: [[number, number, number], [number, number, number], [number, number, number]];
}

// Parses binary STL. Used to verify exports round-trip.
export function decodeBinarySTL(bytes: Uint8Array): { header: string; triangles: STLTriangle[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER_BYTES + 4) throw new Error('STL too short');
  const count = view.getUint32(HEADER_BYTES, true);
  if (bytes.byteLength !== HEADER_BYTES + 4 + count * TRIANGLE_BYTES) {
    throw new Error(`STL length ${bytes.byteLength} does not match ${count} triangles`);
  }
  const header = String.fromCharCode(...bytes.subarray(0, HEADER_BYTES)).replace(/\0+$/, '');
  const triangles: STLTriangle[] = [];
  let offset = HEADER_BYTES + 4;
  const read3 = (): [number, number, number] => {
    const v: [number, number, number] = [
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
    ];
    offset += 12;
    return v;
  };
  for (let t = 0; t < count; t++) {
    const normal = read3();
    const vertices: STLTriangle['vertices'] = [read3(), read3(), read3()];
    offset += 2;
    triangles.push({ normal, vertices });
  }
  return { header, triangles };
}
