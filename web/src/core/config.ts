export type DitherAlgorithm = 'floyd-steinberg' | 'atkinson' | 'jarvis-judice-ninke' | 'none';

export const DITHER_ALGORITHMS: readonly DitherAlgorithm[] = [
  'floyd-steinberg',
  'atkinson',
  'jarvis-judice-ninke',
  'none',
];

export interface ImageConfig {
  // How many cells wide the grid is. Each image is resized to this width (aspect preserved).
  widthInPixels: number;
  // Width of one cell (one pixel) in mm, including the wall. The open floor is cellSize - wallWidth.
  cellSize: number;
  wallWidth: number;
  // Thickness of the base plate in mm.
  bottomThk: number;
  // Plain base plate around the cell grid, in mm.
  border: number;
  // Every wall height is a whole multiple of this, so it should match the slicer's layer height.
  layerHeight: number;
  // Number of distinct wall heights, spread as evenly as whole layers allow from one layer up to
  // maxHeight. Fewer heights leave more of the tone to the dithering. 0 = one height per layer.
  numberOfColorsOverride: number;
  doHorizImage: boolean;
  doVertImage: boolean;
  dither: DitherAlgorithm;
  // Alternate scan direction every row. Breaks up the diagonal "worm" streaks raster-order
  // error diffusion leaves in flat regions.
  serpentine: boolean;
  // Tone curve applied before quantizing: darkness = 1 - (gray/255)^gamma.
  // 1 = linear in gray value, >1 darkens midtones, <1 lightens them.
  gamma: number;
  // Raise the post where each cell's two walls meet high enough that, under either light, it fully
  // shades the top of the wall belonging to the other image. Without this, those wall tops are
  // partly lit by an amount that depends on their height, so each image shows a faint ghost of the
  // other. Only worth it when the wall tops show, i.e. a single-colour print: with walls in a dark
  // filament over a light base, only the floor shows and it never depends on the other image.
  isolationPosts: boolean;
}

export interface ComputedImageConfig extends ImageConfig {
  // Number of distinct wall heights, from 1 layer (white) to maxLayers layers (black).
  numberOfColors: number;
  // Layers in the tallest wall: as many as fit in the open floor width, so its 45 degree shadow
  // covers (almost) the whole floor.
  maxLayers: number;
  // Height of the tallest wall above the base plate, in mm.
  maxHeight: number;
  outputFilename: string;
}

// Tolerance for floating point noise, e.g. (1.2 - 0.4) / 0.1 = 7.999999999999999.
const EPS = 1e-9;

export function computeImageConfig(config: ImageConfig): ComputedImageConfig {
  const maxLayers = Math.floor((config.cellSize - config.wallWidth) / config.layerHeight + EPS);
  const numberOfColors = config.numberOfColorsOverride > 0 ? Math.floor(config.numberOfColorsOverride) : maxLayers;

  const maxHeight = maxLayers * config.layerHeight;

  const levelsSuffix = config.numberOfColorsOverride > 0 ? `_${numberOfColors}levels` : '';
  const outputFilename = `${config.widthInPixels}px_${format(config.cellSize)}cell_${format(config.wallWidth)}wall_${format(config.bottomThk)}bottom_${format(maxHeight)}maxHeight_${format(config.border)}border${levelsSuffix}.stl`;

  return {
    ...config,
    numberOfColors,
    maxLayers,
    maxHeight,
    outputFilename,
  };
}

// Number of layers in the wall at dither level k (0 = white, numberOfColors - 1 = black). Heights
// run evenly from 1 layer to maxLayers, rounded to whole layers with ties going to the shorter wall
// (so 3 levels of up to 8 layers are 1, 4 and 8). With one level per layer, level k is k + 1 layers.
// Every wall is at least one layer tall: a missing wall would leave its cell much brighter.
export function wallLayers(config: ComputedImageConfig, level: number): number {
  const steps = config.numberOfColors - 1;
  return 1 + Math.ceil((level * (config.maxLayers - 1)) / steps - 0.5 - EPS);
}

// Height of the top of a wall at dither level k, measured from the bottom of the base plate.
export function wallTop(config: ComputedImageConfig, level: number): number {
  return config.bottomThk + wallLayers(config, level) * config.layerHeight;
}

// Darkness of each level on the dither scale [0, numberOfColors - 1]. A wall's shadow, and so the
// darkness of its cell, grows linearly with its height, so this is where each (rounded) wall height
// really sits between the shortest and the tallest. Dithering diffuses error against these values,
// which keeps the average tone right even when the heights aren't evenly spaced.
export function levelTones(config: ComputedImageConfig): number[] {
  const steps = config.numberOfColors - 1;
  return Array.from({ length: config.numberOfColors }, (_, k) =>
    ((wallLayers(config, k) - 1) / (config.maxLayers - 1)) * steps);
}

// Height of an isolation post, measured from the bottom of the base plate: tall enough that a
// 45 degree shadow from the post covers the full length of the top of a wall whose top is at
// wallTopZ (by default the tallest wall), rounded up to a whole layer.
export function isolationPostTop(config: ComputedImageConfig, wallTopZ = config.bottomThk + config.maxHeight): number {
  const needed = wallTopZ - config.bottomThk + (config.cellSize - config.wallWidth);
  return config.bottomThk + Math.ceil(needed / config.layerHeight - EPS) * config.layerHeight;
}

// Returns human readable problems with the config, or an empty list if it is usable.
export function validateConfig(config: ImageConfig): string[] {
  const errors: string[] = [];
  const positive: (keyof ImageConfig)[] = ['cellSize', 'wallWidth', 'bottomThk', 'layerHeight', 'gamma'];
  for (const key of positive) {
    const value = config[key] as number;
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${key} must be a positive number`);
    }
  }
  if (!Number.isFinite(config.border) || config.border < 0) {
    errors.push('border must be zero or a positive number');
  }
  if (!Number.isInteger(config.widthInPixels) || config.widthInPixels < 1 || config.widthInPixels > 1000) {
    errors.push('widthInPixels must be a whole number between 1 and 1000');
  }
  if (config.wallWidth >= config.cellSize) {
    errors.push('wallWidth must be smaller than cellSize');
  }
  if (!Number.isFinite(config.numberOfColorsOverride) || config.numberOfColorsOverride < 0 || config.numberOfColorsOverride > 255) {
    errors.push('numberOfColorsOverride must be between 0 (auto) and 255');
  }
  if (!DITHER_ALGORITHMS.includes(config.dither)) {
    errors.push(`dither must be one of ${DITHER_ALGORITHMS.join(', ')}`);
  }
  if (errors.length === 0) {
    const { numberOfColors, maxLayers } = computeImageConfig(config);
    if (maxLayers < 2) {
      errors.push(`only ${maxLayers} height level fits; increase cellSize or decrease wallWidth/layerHeight`);
    } else if (numberOfColors < 2 || numberOfColors > maxLayers) {
      errors.push(`numberOfColorsOverride must be between 2 and ${maxLayers} (one per layer) for these dimensions`);
    }
  }
  return errors;
}

export function format(n: number): string {
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}

export const defaultConfig: ImageConfig = {
  widthInPixels: 25,
  cellSize: 1.2,
  wallWidth: 0.26,
  bottomThk: 0.9,
  border: 1.2,
  layerHeight: 0.1,
  numberOfColorsOverride: 0,
  doHorizImage: true,
  doVertImage: true,
  dither: 'floyd-steinberg',
  serpentine: true,
  gamma: 1,
  isolationPosts: false,
};

export const presetConfigs = {
  default: defaultConfig,
  p2: {
    ...defaultConfig,
    widthInPixels: 50,
    cellSize: 1,
    wallWidth: 0.2,
    bottomThk: 0.4,
    border: 1,
    layerHeight: 0.05,
  },
  p3: {
    ...defaultConfig,
    widthInPixels: 85,
    cellSize: 1.1,
    wallWidth: 0.22,
    bottomThk: 0.6,
    border: 1.1,
    layerHeight: 0.05,
  },
  fuji: {
    ...defaultConfig,
    widthInPixels: 100,
    cellSize: 1.1,
    wallWidth: 0.22,
    bottomThk: 0.6,
    border: 1.1,
    layerHeight: 0.05,
  },
} as const satisfies Record<string, ImageConfig>;
