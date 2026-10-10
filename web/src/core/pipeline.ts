import { computeImageConfig, levelTones, validateConfig } from './config';
import type { ComputedImageConfig, ImageConfig } from './config';
import { quantize } from './dither';
import type { LevelMap } from './dither';
import { heightfieldFromBoxes, heightfieldVolume } from './heightfield';
import type { Heightfield } from './heightfield';
import { cropImage, defaultFraming, fitCrop } from './framing';
import type { CropRect, Framing, ImageSlot } from './framing';
import { resizeArea, resizeToWidth } from './image';
import type { GrayImage } from './image';
import { layoutBoxes } from './layout';
import type { Layout } from './layout';
import { meshHeightfield } from './mesh';
import type { Mesh } from './mesh';
import { encodeBinarySTL } from './stl';

export interface ShadowCasterInput {
  // Shadow cast by light from the left (-X).
  horiz: GrayImage | null;
  // Shadow cast by light from the back (+Y).
  vert: GrayImage | null;
  config: ImageConfig;
  // Which image keeps its aspect ratio and how the other is cropped to match. Default: the
  // horizontal image leads and the vertical one is centre-cropped.
  framing?: Framing;
}

export interface FittedImages {
  horiz: GrayImage | null;
  vert: GrayImage | null;
  // The image used whole, or null if there is no image at all.
  lead: ImageSlot | null;
  // The part of the other image that was used, in its source pixels; null with only one image.
  crop: CropRect | null;
}

export interface ShadowCasterModel {
  config: ComputedImageConfig;
  lead: ImageSlot | null;
  crop: CropRect | null;
  horizLevels: LevelMap | null;
  vertLevels: LevelMap | null;
  layout: Layout;
  heightfield: Heightfield;
  mesh: Mesh;
  stats: ModelStats;
}

export interface ModelStats {
  cols: number;
  rows: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  volumeMm3: number;
  triangles: number;
  vertices: number;
  stlBytes: number;
}

// Resizes the lead image to the grid width, keeping its aspect ratio, which sets the number of rows.
// The other image is cropped to the same aspect ratio (see fitCrop) and resized to the same grid,
// so the two overlay cell for cell. Neither is ever stretched.
export function fitImages(
  horiz: GrayImage | null,
  vert: GrayImage | null,
  widthInPixels: number,
  framing: Framing = defaultFraming,
): FittedImages {
  if (!horiz || !vert) {
    return {
      horiz: horiz && resizeToWidth(horiz, widthInPixels),
      vert: vert && resizeToWidth(vert, widthInPixels),
      lead: horiz ? 'horiz' : vert ? 'vert' : null,
      crop: null,
    };
  }
  const [leadImg, followImg] = framing.lead === 'horiz' ? [horiz, vert] : [vert, horiz];
  const fittedLead = resizeToWidth(leadImg, widthInPixels);
  const crop = fitCrop(followImg, leadImg.width / leadImg.height, framing.crop);
  const fittedFollow = resizeArea(cropImage(followImg, crop), fittedLead.width, fittedLead.height);
  return framing.lead === 'horiz'
    ? { horiz: fittedLead, vert: fittedFollow, lead: 'horiz', crop }
    : { horiz: fittedFollow, vert: fittedLead, lead: 'vert', crop };
}

export function quantizeImage(img: GrayImage, config: ComputedImageConfig): LevelMap {
  return quantize(img, config.numberOfColors, {
    algorithm: config.dither,
    serpentine: config.serpentine,
    gamma: config.gamma,
    tones: levelTones(config),
  });
}

export function generateModel(input: ShadowCasterInput): ShadowCasterModel {
  const errors = validateConfig(input.config);
  if (errors.length > 0) throw new Error(`Invalid config: ${errors.join('; ')}`);
  const config = computeImageConfig(input.config);
  const horizIn = config.doHorizImage ? input.horiz : null;
  const vertIn = config.doVertImage ? input.vert : null;
  if (!horizIn && !vertIn) throw new Error('At least one enabled image is required');

  const fitted = fitImages(horizIn, vertIn, config.widthInPixels, input.framing);
  const horizLevels = fitted.horiz && quantizeImage(fitted.horiz, config);
  const vertLevels = fitted.vert && quantizeImage(fitted.vert, config);

  const layout = layoutBoxes(horizLevels, vertLevels, config);
  const heightfield = heightfieldFromBoxes(layout.boxes);
  const mesh = meshHeightfield(heightfield);

  let heightMm = 0;
  for (const z of heightfield.z) heightMm = Math.max(heightMm, z);
  const triangles = mesh.indices.length / 3;
  return {
    config,
    lead: fitted.lead,
    crop: fitted.crop,
    horizLevels,
    vertLevels,
    layout,
    heightfield,
    mesh,
    stats: {
      cols: layout.cols,
      rows: layout.rows,
      widthMm: layout.width,
      depthMm: layout.depth,
      heightMm,
      volumeMm3: heightfieldVolume(heightfield),
      triangles,
      vertices: mesh.positions.length / 3,
      stlBytes: 84 + 50 * triangles,
    },
  };
}

export function modelToSTL(model: ShadowCasterModel): Uint8Array {
  const c = model.config;
  return encodeBinarySTL(
    model.mesh,
    `Shadow Caster ${model.stats.cols}x${model.stats.rows} cell=${c.cellSize} wall=${c.wallWidth} layer=${c.layerHeight}`,
  );
}
