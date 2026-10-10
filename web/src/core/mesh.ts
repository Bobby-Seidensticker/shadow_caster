import type { Heightfield } from './heightfield';

// Indexed triangle mesh. Triangles wind counter-clockwise when seen from outside the solid.
export interface Mesh {
  positions: Float32Array;
  indices: Uint32Array;
}

class GrowableArray<T extends Float32Array | Uint32Array> {
  data: T;
  length = 0;
  private readonly make: (n: number) => T;

  constructor(make: (n: number) => T, initial: number) {
    this.make = make;
    this.data = make(Math.max(16, initial));
  }

  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  toArray(): T {
    return this.data.slice(0, this.length) as T;
  }
}

// Builds a closed, 2-manifold surface for a heightfield whose rects all have positive height:
// a top face per rect, vertical walls wherever neighbouring heights differ (including the outer
// perimeter), and a flat bottom.
//
// Vertical edges are split at every height present around their grid point, so there are no
// T-junctions: every edge is shared by exactly two triangles with opposite winding. Slicers and
// mesh checkers treat that as watertight, unlike the overlapping boxes this replaced.
export function meshHeightfield(hf: Heightfield): Mesh {
  const { xs, ys, nx, ny } = hf;
  const zLevels = Float64Array.from(new Set([0, ...hf.z])).sort();
  const zIndex = new Map<number, number>();
  zLevels.forEach((z, i) => zIndex.set(z, i));
  const rectZ = new Int32Array(nx * ny);
  for (let k = 0; k < rectZ.length; k++) {
    if (!(hf.z[k] > 0)) throw new Error('Every heightfield rect must have a positive height');
    rectZ[k] = zIndex.get(hf.z[k])!;
  }
  const nz = zLevels.length;
  const zAt = (ix: number, iy: number) =>
    ix < 0 || iy < 0 || ix >= nx || iy >= ny ? 0 : rectZ[iy * nx + ix];

  const positions = new GrowableArray((n) => new Float32Array(n), nx * ny * 12);
  const indices = new GrowableArray((n) => new Uint32Array(n), nx * ny * 24);
  const vertexIds = new Map<number, number>();
  let vertexCount = 0;
  const vertex = (gx: number, gy: number, iz: number): number => {
    const key = (gy * (nx + 1) + gx) * nz + iz;
    let id = vertexIds.get(key);
    if (id === undefined) {
      id = vertexCount++;
      vertexIds.set(key, id);
      positions.push3(xs[gx], ys[gy], zLevels[iz]);
    }
    return id;
  };

  // Height levels between lo and hi (inclusive, ascending) present at grid point (gx, gy).
  const column = (gx: number, gy: number, lo: number, hi: number): number[] => {
    const around = [zAt(gx - 1, gy - 1), zAt(gx, gy - 1), zAt(gx - 1, gy), zAt(gx, gy), lo, hi];
    return Array.from(new Set(around.filter((z) => z >= lo && z <= hi))).sort((a, b) => a - b);
  };

  // Triangulates the vertical strip between two columns of vertices, zipping them together in
  // height order. With column b at greater x (or y) than column a, `flip` = false winds the
  // triangles to face +x for a wall along y, or -y for a wall along x.
  const ladder = (
    ga: [number, number], aZ: number[],
    gb: [number, number], bZ: number[],
    flip: boolean,
  ) => {
    const a = aZ.map((iz) => vertex(ga[0], ga[1], iz));
    const b = bZ.map((iz) => vertex(gb[0], gb[1], iz));
    let i = 0;
    let j = 0;
    while (i < a.length - 1 || j < b.length - 1) {
      if (j < b.length - 1 && (i === a.length - 1 || bZ[j + 1] <= aZ[i + 1])) {
        if (flip) indices.push3(a[i], b[j + 1], b[j]);
        else indices.push3(a[i], b[j], b[j + 1]);
        j++;
      } else {
        if (flip) indices.push3(a[i], a[i + 1], b[j]);
        else indices.push3(a[i], b[j], a[i + 1]);
        i++;
      }
    }
  };

  // Top faces.
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const iz = rectZ[iy * nx + ix];
      const a = vertex(ix, iy, iz);
      const b = vertex(ix + 1, iy, iz);
      const c = vertex(ix + 1, iy + 1, iz);
      const d = vertex(ix, iy + 1, iz);
      indices.push3(a, b, c);
      indices.push3(a, c, d);
    }
  }

  // Walls along y (constant x), between rect (gx - 1, gy) on the west and (gx, gy) on the east.
  for (let gx = 0; gx <= nx; gx++) {
    for (let gy = 0; gy < ny; gy++) {
      const west = zAt(gx - 1, gy);
      const east = zAt(gx, gy);
      if (west === east) continue;
      const lo = Math.min(west, east);
      const hi = Math.max(west, east);
      ladder([gx, gy], column(gx, gy, lo, hi), [gx, gy + 1], column(gx, gy + 1, lo, hi), east > west);
    }
  }

  // Walls along x (constant y), between rect (gx, gy - 1) on the south and (gx, gy) on the north.
  for (let gy = 0; gy <= ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const south = zAt(gx, gy - 1);
      const north = zAt(gx, gy);
      if (south === north) continue;
      const lo = Math.min(south, north);
      const hi = Math.max(south, north);
      ladder([gx, gy], column(gx, gy, lo, hi), [gx + 1, gy], column(gx + 1, gy, lo, hi), south > north);
    }
  }

  // Bottom: a fan from the centre to every perimeter vertex, which are all on the z = 0 outline.
  const perimeter: number[] = [];
  for (let gx = 0; gx < nx; gx++) perimeter.push(vertex(gx, 0, 0));
  for (let gy = 0; gy < ny; gy++) perimeter.push(vertex(nx, gy, 0));
  for (let gx = nx; gx > 0; gx--) perimeter.push(vertex(gx, ny, 0));
  for (let gy = ny; gy > 0; gy--) perimeter.push(vertex(0, gy, 0));
  const center = vertexCount++;
  positions.push3((xs[0] + xs[nx]) / 2, (ys[0] + ys[ny]) / 2, 0);
  for (let k = 0; k < perimeter.length; k++) {
    indices.push3(center, perimeter[(k + 1) % perimeter.length], perimeter[k]);
  }

  return { positions: positions.toArray(), indices: indices.toArray() };
}

export function triangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3;
}
