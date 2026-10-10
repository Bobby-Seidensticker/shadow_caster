import type { Mesh } from '../core/mesh';

export interface MeshReport {
  triangles: number;
  vertices: number;
  // Undirected edges not shared by exactly two triangles.
  nonManifoldEdges: number;
  // Edges whose two triangles traverse them in the same direction (inconsistent winding).
  misorientedEdges: number;
  // Edges traversed a different number of times in each direction. Zero means the surface is
  // closed and consistently wound, even if some edges are shared by four triangles.
  unbalancedEdges: number;
  degenerateTriangles: number;
  // Signed volume from the divergence theorem; positive when normals point outward.
  volume: number;
  eulerCharacteristic: number;
  components: number;
  min: [number, number, number];
  max: [number, number, number];
}

// Topological and geometric checks a slicer cares about. Vertices are welded by exact position so
// this also catches meshes that only look connected because of duplicated vertices.
export function analyzeMesh(mesh: Mesh): MeshReport {
  const { positions: p, indices } = mesh;
  const weld = new Map<string, number>();
  const ids = new Int32Array(p.length / 3);
  for (let v = 0; v < ids.length; v++) {
    const key = `${p[v * 3]},${p[v * 3 + 1]},${p[v * 3 + 2]}`;
    let id = weld.get(key);
    if (id === undefined) {
      id = weld.size;
      weld.set(key, id);
    }
    ids[v] = id;
  }

  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();
  let degenerateTriangles = 0;
  let volume = 0;
  const parent = new Int32Array(weld.size).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const used = new Uint8Array(weld.size);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let t = 0; t < indices.length; t += 3) {
    const raw = [indices[t], indices[t + 1], indices[t + 2]];
    const v = raw.map((i) => ids[i]);
    const [a, b, c] = raw.map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
    for (const q of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], q[k]);
        max[k] = Math.max(max[k], q[k]);
      }
    }
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12 || new Set(v).size < 3) degenerateTriangles++;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let e = 0; e < 3; e++) {
      const from = v[e];
      const to = v[(e + 1) % 3];
      const dKey = `${from}>${to}`;
      directed.set(dKey, (directed.get(dKey) ?? 0) + 1);
      const uKey = from < to ? `${from}-${to}` : `${to}-${from}`;
      undirected.set(uKey, (undirected.get(uKey) ?? 0) + 1);
      parent[find(from)] = find(to);
    }
    for (const id of v) used[id] = 1;
  }

  let nonManifoldEdges = 0;
  for (const count of undirected.values()) if (count !== 2) nonManifoldEdges++;
  let misorientedEdges = 0;
  for (const [key, count] of directed) {
    const [from, to] = key.split('>');
    if (count !== 1 || directed.get(`${to}>${from}`) !== 1) misorientedEdges++;
  }
  let unbalancedEdges = 0;
  for (const [key, count] of directed) {
    const [from, to] = key.split('>');
    if (directed.get(`${to}>${from}`) !== count) unbalancedEdges++;
  }
  const roots = new Set<number>();
  let vertices = 0;
  for (let i = 0; i < used.length; i++) {
    if (!used[i]) continue;
    vertices++;
    roots.add(find(i));
  }

  return {
    triangles: indices.length / 3,
    vertices,
    nonManifoldEdges,
    misorientedEdges,
    unbalancedEdges,
    degenerateTriangles,
    volume,
    eulerCharacteristic: vertices - undirected.size + indices.length / 3,
    components: roots.size,
    min,
    max,
  };
}

// Deterministic PRNG so randomized tests are reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pearson correlation of two equal-length series.
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return cov / Math.sqrt(va * vb);
}
