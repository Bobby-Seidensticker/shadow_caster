export interface ImageConfig {
  horizImageFilename: string;
  vertImageFilename: string;
  widthInPixels: number;
  doHorizImage: boolean;
  doVertImage: boolean;
  cellSize: number;
  wallWidth: number;
  bottomThk: number;
  layerHeight: number;
  numberOfColorsOverride: number;
}

export interface ComputedImageConfig extends ImageConfig {
  maxHeight: number;
  numberOfColors: number;
  border: number;
  outputFilename: string;
}

export function computeImageConfig(config: ImageConfig): ComputedImageConfig {
  const numberOfColors = config.numberOfColorsOverride === 0 
    ? Math.floor((config.cellSize - config.wallWidth) / config.layerHeight)
    : config.numberOfColorsOverride;
  
  const maxHeight = numberOfColors * config.layerHeight;
  const border = config.cellSize;
  
  const outputFilename = `${config.widthInPixels}px_${format(config.cellSize)}cell_${format(config.wallWidth)}wall_${format(config.bottomThk)}bottom_${format(maxHeight)}maxHeight.stl`;
  
  return {
    ...config,
    maxHeight,
    numberOfColors,
    border,
    outputFilename
  };
}

export function format(n: number): string {
  return n.toFixed(n === Math.floor(n) ? 0 : 2);
}

export const defaultConfig: ImageConfig = {
  horizImageFilename: 'horizontal.jpg',
  vertImageFilename: 'vertical.jpg',
  widthInPixels: 100,
  doHorizImage: true,
  doVertImage: true,
  cellSize: 2.1,
  wallWidth: 0.4,
  bottomThk: 0.8,
  layerHeight: 0.1,
  numberOfColorsOverride: 0,
};

export const presetConfigs = {
  default: defaultConfig,
  p2: {
    ...defaultConfig,
    widthInPixels: 50,
    cellSize: 1,
    wallWidth: 0.2,
    bottomThk: 0.4,
    layerHeight: 0.05
  },
  p3: {
    ...defaultConfig,
    widthInPixels: 85,
    cellSize: 1.1,
    wallWidth: 0.22,
    bottomThk: 0.6,
    layerHeight: 0.05
  },
  fuji: {
    ...defaultConfig,
    horizImageFilename: 'great_wave.jpg',
    vertImageFilename: 'red_fuji.jpg',
    widthInPixels: 100,
    cellSize: 1.1,
    wallWidth: 0.22,
    bottomThk: 0.6,
    layerHeight: 0.05
  }
} as const;