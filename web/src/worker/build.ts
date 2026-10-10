import type { ImageConfig } from '../core/config';
import { levelsToGray } from '../core/dither';
import type { Framing } from '../core/framing';
import type { LevelMap } from '../core/dither';
import type { GrayImage } from '../core/image';
import { generateModel, modelToSTL } from '../core/pipeline';
import type { ModelStats, ShadowCasterModel } from '../core/pipeline';
import { castShadows, cellBrightness } from '../core/simulate';
import type { LightDirection } from '../core/simulate';

export interface GenerateRequest {
  id: number;
  horiz: GrayImage | null;
  vert: GrayImage | null;
  config: ImageConfig;
  framing?: Framing;
}

export interface ImagePreview {
  // The quantized wall heights as gray levels.
  dithered: GrayImage;
  // What the print should look like from above under its light (simulated, 45 degrees).
  shadow: GrayImage;
}

export interface GenerateSuccess {
  id: number;
  ok: true;
  stl: Uint8Array;
  filename: string;
  stats: ModelStats;
  numberOfColors: number;
  maxHeight: number;
  horizPreview: ImagePreview | null;
  vertPreview: ImagePreview | null;
  ms: number;
}

export interface GenerateFailure {
  id: number;
  ok: false;
  error: string;
}

export type GenerateResponse = GenerateSuccess | GenerateFailure;

function preview(model: ShadowCasterModel, levels: LevelMap | null, direction: LightDirection): ImagePreview | null {
  if (!levels) return null;
  return {
    dithered: levelsToGray(levels),
    shadow: cellBrightness(model.heightfield, castShadows(model.heightfield, direction), model.layout, model.config.cellSize),
  };
}

// Everything the UI needs from one set of inputs. Runs in the worker, or inline as a fallback.
export function buildArtifacts(request: GenerateRequest): GenerateResponse {
  const started = performance.now();
  try {
    const model = generateModel({ horiz: request.horiz, vert: request.vert, config: request.config, framing: request.framing });
    return {
      id: request.id,
      ok: true,
      stl: modelToSTL(model),
      filename: model.config.outputFilename,
      stats: model.stats,
      numberOfColors: model.config.numberOfColors,
      maxHeight: model.config.maxHeight,
      horizPreview: preview(model, model.horizLevels, 'west'),
      vertPreview: preview(model, model.vertLevels, 'north'),
      ms: performance.now() - started,
    };
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
