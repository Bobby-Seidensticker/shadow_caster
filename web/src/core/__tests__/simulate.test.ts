import { describe, expect, it } from 'vitest';
import { computeImageConfig, defaultConfig, presetConfigs } from '../config';
import type { ImageConfig } from '../config';
import type { LevelMap } from '../dither';
import { heightfieldFromBoxes } from '../heightfield';
import { layoutBoxes } from '../layout';
import { castShadows, cellBrightness, litFraction, renderShadow } from '../simulate';
import { generateModel } from '../pipeline';
import { grayFromFunction } from '../../test/fixtures';
import { mulberry32 } from '../../test/meshCheck';

const base = { x0: 0, y0: 0, x1: 10, y1: 10, z: 1 };

function randomLevels(cols: number, rows: number, levels: number, rand: () => number): LevelMap {
  return {
    width: cols, height: rows, levels,
    data: Uint8Array.from({ length: cols * rows }, () => Math.floor(rand() * levels)),
  };
}

describe('castShadows', () => {
  it('casts a wall shadow as long as the wall is tall at 45 degrees', () => {
    const hf = heightfieldFromBoxes([base, { x0: 2, y0: 0, x1: 2.5, y1: 10, z: 2.5 }]);
    const map = castShadows(hf, 'west');
    // Floor east of the wall: 1.5 mm of wall above the floor -> 1.5 mm of shadow.
    expect(litFraction(hf, map, 2.5, 10, 0, 10)).toBeCloseTo((7.5 - 1.5) / 7.5, 12);
    // West of the wall is fully lit.
    expect(litFraction(hf, map, 0, 2, 0, 10)).toBe(1);
  });

  it('scales shadow length with the light elevation', () => {
    const hf = heightfieldFromBoxes([base, { x0: 2, y0: 0, x1: 2.5, y1: 10, z: 2 }]);
    const map = castShadows(hf, 'west', 30);
    const length = 1 / Math.tan(Math.PI / 6);
    expect(litFraction(hf, map, 2.5, 10, 0, 10)).toBeCloseTo((7.5 - length) / 7.5, 12);
  });

  it('shades a lower top face by the height difference', () => {
    const hf = heightfieldFromBoxes([
      base,
      { x0: 2, y0: 0, x1: 3, y1: 10, z: 4 },
      { x0: 3, y0: 0, x1: 8, y1: 10, z: 3 },
    ]);
    const map = castShadows(hf, 'west');
    expect(litFraction(hf, map, 3, 8, 0, 10)).toBeCloseTo(4 / 5, 12);
    // The shadow off the end of the lower block: 2 mm drop, 2 mm shadow on the floor.
    expect(litFraction(hf, map, 8, 10, 0, 10)).toBeCloseTo(0, 12);
  });

  it('lets a long shadow run across several faces', () => {
    const hf = heightfieldFromBoxes([base, { x0: 1, y0: 0, x1: 1.5, y1: 10, z: 6 }]);
    const map = castShadows(hf, 'west');
    expect(litFraction(hf, map, 1.5, 6.5, 0, 10)).toBeCloseTo(0, 12);
    expect(litFraction(hf, map, 6.5, 10, 0, 10)).toBeCloseTo(1, 12);
  });

  it('casts north light shadows toward the front', () => {
    const hf = heightfieldFromBoxes([base, { x0: 0, y0: 7, x1: 10, y1: 7.5, z: 3 }]);
    const map = castShadows(hf, 'north');
    expect(litFraction(hf, map, 0, 10, 0, 7)).toBeCloseTo((7 - 2) / 7, 12);
    expect(litFraction(hf, map, 0, 10, 7.5, 10)).toBe(1);
    // The same wall lit from the side is parallel to the light and casts nothing on the floor.
    expect(litFraction(hf, castShadows(hf, 'west'), 0, 10, 0, 7)).toBe(1);
  });

  it('rasterizes the same shading it computes analytically', () => {
    const c = computeImageConfig(defaultConfig);
    const rand = mulberry32(5);
    const layout = layoutBoxes(randomLevels(6, 4, 17, rand), randomLevels(6, 4, 17, rand), c);
    const hf = heightfieldFromBoxes(layout.boxes);
    for (const direction of ['west', 'north'] as const) {
      const map = castShadows(hf, direction);
      const pxPerMm = 40;
      const raster = renderShadow(hf, map, pxPerMm);
      const cells = cellBrightness(hf, map, layout, c.cellSize);
      for (let r = 0; r < layout.rows; r++) {
        for (let i = 0; i < layout.cols; i++) {
          // Average the raster pixels inside cell (i, r); raster row 0 is the back edge.
          const px0 = Math.round(layout.cellX[i] * pxPerMm);
          const px1 = Math.round((layout.cellX[i] + c.cellSize) * pxPerMm);
          const py0 = Math.round((layout.depth - layout.cellY[r] - c.cellSize) * pxPerMm);
          const py1 = Math.round((layout.depth - layout.cellY[r]) * pxPerMm);
          let sum = 0;
          for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) sum += raster.data[y * raster.width + x];
          expect(Math.abs(sum / ((px1 - px0) * (py1 - py0)) - cells.data[r * layout.cols + i])).toBeLessThan(4);
        }
      }
    }
  });
});

describe('shadow physics of the generated layout', () => {
  // Expected lit fraction of a cell with isolation posts, from the geometry: the wall top along the
  // light and the post are lit, the other image's wall top is fully shaded by the post, and the
  // floor is shaded for as far as the wall is tall.
  const expectedBrightness = (c: ReturnType<typeof computeImageConfig>, level: number) => {
    const f = c.cellSize - c.wallWidth;
    const shadow = Math.min(f, (level + 1) * c.layerHeight);
    return (255 * (c.wallWidth * c.cellSize + f * (f - shadow))) / c.cellSize ** 2;
  };

  it.each(Object.keys(presetConfigs) as (keyof typeof presetConfigs)[])(
    'cell brightness is exactly linear in the dither level (%s preset)',
    (name) => {
      const c = computeImageConfig(presetConfigs[name]);
      const n = c.numberOfColors;
      // One row per level, in both images, with a different arrangement in each.
      const horiz: LevelMap = { width: n, height: n, levels: n, data: new Uint8Array(n * n) };
      const vert: LevelMap = { width: n, height: n, levels: n, data: new Uint8Array(n * n) };
      for (let r = 0; r < n; r++) {
        for (let i = 0; i < n; i++) {
          horiz.data[r * n + i] = (r + i) % n;
          vert.data[r * n + i] = (r * 3 + i * 5) % n;
        }
      }
      const layout = layoutBoxes(horiz, vert, c);
      const hf = heightfieldFromBoxes(layout.boxes);
      const west = cellBrightness(hf, castShadows(hf, 'west'), layout, c.cellSize);
      const north = cellBrightness(hf, castShadows(hf, 'north'), layout, c.cellSize);
      // The last row of the horizontal image and the last column of the vertical one have no walls.
      for (let k = 0; k < n * n; k++) {
        if (k < n * (n - 1)) expect(west.data[k]).toBeCloseTo(expectedBrightness(c, horiz.data[k]), 3);
        if (k % n !== n - 1) expect(north.data[k]).toBeCloseTo(expectedBrightness(c, vert.data[k]), 3);
      }
    },
  );

  it('gives darker levels strictly darker cells', () => {
    const c = computeImageConfig(defaultConfig);
    for (let k = 1; k < c.numberOfColors; k++) {
      expect(expectedBrightness(c, k)).toBeLessThan(expectedBrightness(c, k - 1));
    }
  });

  it('isolation posts make each image completely independent of the other', () => {
    const c = computeImageConfig(defaultConfig);
    const rand = mulberry32(11);
    const horiz = randomLevels(12, 9, c.numberOfColors, rand);
    const brightness = (vert: LevelMap, direction: 'west' | 'north', h: LevelMap) => {
      const layout = layoutBoxes(h, vert, c);
      const hf = heightfieldFromBoxes(layout.boxes);
      return cellBrightness(hf, castShadows(hf, direction), layout, c.cellSize).data;
    };
    const reference = brightness(randomLevels(12, 9, c.numberOfColors, rand), 'west', horiz);
    for (let trial = 0; trial < 5; trial++) {
      expect(brightness(randomLevels(12, 9, c.numberOfColors, rand), 'west', horiz)).toEqual(reference);
    }
    // And the other way round.
    const vert = randomLevels(12, 9, c.numberOfColors, rand);
    const fromBack = (h: LevelMap) => brightness(vert, 'north', h);
    expect(fromBack(randomLevels(12, 9, c.numberOfColors, rand))).toEqual(fromBack(randomLevels(12, 9, c.numberOfColors, rand)));
  });

  it('without isolation posts the other image bleeds through (the old ghosting bug)', () => {
    const c = computeImageConfig({ ...defaultConfig, isolationPosts: false } satisfies ImageConfig);
    const n = c.numberOfColors;
    const horiz: LevelMap = { width: 4, height: 4, levels: n, data: new Uint8Array(16).fill(8) };
    const shade = (vertLevel: number) => {
      const vert: LevelMap = { width: 4, height: 4, levels: n, data: new Uint8Array(16).fill(vertLevel) };
      const layout = layoutBoxes(horiz, vert, c);
      const hf = heightfieldFromBoxes(layout.boxes);
      return cellBrightness(hf, castShadows(hf, 'west'), layout, c.cellSize).data[5];
    };
    // Same horizontal image, different vertical image, visibly different shadow.
    expect(shade(n - 1) - shade(0)).toBeGreaterThan(10);
  });
});

describe('black walls on a white base', () => {
  // Wall tops are dark whatever the light, so only the lit floor counts.
  const config: ImageConfig = {
    ...defaultConfig, widthInPixels: 40, cellSize: 1.1, wallWidth: 0.22, bottomThk: 0.9, numberOfColorsOverride: 3,
  };
  const meanBrightness = (gray: number, direction: 'west' | 'north') => {
    const img = grayFromFunction(40, 40, () => gray);
    const model = generateModel({ horiz: img, vert: img, config });
    const map = castShadows(model.heightfield, direction);
    const cells = cellBrightness(model.heightfield, map, model.layout, model.config.cellSize, model.config.bottomThk);
    // Skip the outer ring of cells, which border the plain base plate.
    let sum = 0, n = 0;
    for (let r = 1; r < 39; r++) for (let i = 1; i < 39; i++) { sum += cells.data[r * 40 + i]; n++; }
    return sum / n;
  };

  it('counts only the lit floor: floor width minus the shadow, over the cell', () => {
    const floor = 1.1 - 0.22;
    for (const [gray, wall] of [[255, 0.1], [0, 0.8]] as const) {
      for (const direction of ['west', 'north'] as const) {
        expect(meanBrightness(gray, direction)).toBeCloseTo((255 * floor * (floor - wall)) / (1.1 * 1.1), 4);
      }
    }
  });

  it('reproduces mid grays linearly with only three wall heights', () => {
    const white = meanBrightness(255, 'west');
    const black = meanBrightness(0, 'west');
    for (const gray of [40, 90, 128, 170, 220]) {
      const want = black + ((white - black) * gray) / 255;
      expect(Math.abs(meanBrightness(gray, 'west') - want)).toBeLessThan(0.02 * (white - black));
    }
  });
});
