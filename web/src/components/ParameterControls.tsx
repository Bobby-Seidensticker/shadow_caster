import React from 'react';
import { DITHER_ALGORITHMS, presetConfigs, validateConfig } from '../core/config';
import type { DitherAlgorithm, ImageConfig } from '../core/config';

interface ParameterControlsProps {
  config: ImageConfig;
  onChange: (config: ImageConfig) => void;
}

type NumericKey = {
  [K in keyof ImageConfig]: ImageConfig[K] extends number ? K : never;
}[keyof ImageConfig];

const NUMBER_FIELDS: { key: NumericKey; label: string; step: number; min: number; hint?: string }[] = [
  { key: 'widthInPixels', label: 'Width (cells)', step: 1, min: 1, hint: 'One cell per pixel' },
  { key: 'cellSize', label: 'Cell Size (mm)', step: 0.1, min: 0.1, hint: 'Includes the wall' },
  { key: 'wallWidth', label: 'Wall Width (mm)', step: 0.01, min: 0.01, hint: 'About one nozzle width' },
  { key: 'bottomThk', label: 'Bottom Thickness (mm)', step: 0.1, min: 0.1 },
  { key: 'border', label: 'Border (mm)', step: 0.1, min: 0, hint: 'Plain plate around the grid' },
  { key: 'layerHeight', label: 'Layer Height (mm)', step: 0.01, min: 0.01, hint: 'Match your slicer' },
  { key: 'numberOfColorsOverride', label: 'Height Levels (0 = auto)', step: 1, min: 0 },
  { key: 'gamma', label: 'Gamma', step: 0.1, min: 0.1, hint: '>1 darkens midtones' },
];

const DITHER_LABELS: Record<DitherAlgorithm, string> = {
  'floyd-steinberg': 'Floyd–Steinberg',
  atkinson: 'Atkinson (more contrast)',
  'jarvis-judice-ninke': 'Jarvis–Judice–Ninke (smoother)',
  none: 'None (posterize)',
};

const PRESET_LABELS: Record<keyof typeof presetConfigs, string> = {
  default: 'Default for 0.2mm nozzle',
  p2: 'P2 (1 mm cells)',
  p3: 'P3 (1.1 mm cells)',
  fuji: 'Fuji (1.1 mm cells)',
};

// The preset whose settings match the config (ignoring which images are enabled), or '' if none do.
function matchingPreset(config: ImageConfig): string {
  const matches = (preset: ImageConfig) => (Object.keys(preset) as (keyof ImageConfig)[])
    .every((k) => k === 'doHorizImage' || k === 'doVertImage' || preset[k] === config[k]);
  return Object.keys(PRESET_LABELS).find((name) => matches(presetConfigs[name as keyof typeof presetConfigs])) ?? '';
}

export function ParameterControls({ config, onChange }: ParameterControlsProps) {
  const errors = validateConfig(config);

  const setNumber = (key: NumericKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...config, [key]: e.target.value === '' ? NaN : Number(e.target.value) });
  };
  const setBoolean = (key: 'doHorizImage' | 'doVertImage' | 'serpentine' | 'isolationPosts') =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...config, [key]: e.target.checked });

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetName = e.target.value as keyof typeof presetConfigs;
    if (presetConfigs[presetName]) {
      // Presets set the physical dimensions; keep which images are enabled.
      onChange({
        ...presetConfigs[presetName],
        doHorizImage: config.doHorizImage,
        doVertImage: config.doVertImage,
      });
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold">Parameters</h2>

      <div>
        <label htmlFor="preset" className="block text-sm font-medium mb-1">Preset</label>
        <select id="preset" onChange={handlePresetChange} value={matchingPreset(config)} className="w-full p-2 border rounded">
          {Object.entries(PRESET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
          <option value="">Custom</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {NUMBER_FIELDS.map(({ key, label, step, min, hint }) => (
          <div key={key}>
            <label htmlFor={key} className="block text-sm font-medium mb-1">{label}</label>
            <input
              id={key}
              type="number"
              value={Number.isNaN(config[key]) ? '' : config[key]}
              onChange={setNumber(key)}
              className="w-full p-2 border rounded"
              min={min}
              step={step}
            />
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
          </div>
        ))}

        <div>
          <label htmlFor="dither" className="block text-sm font-medium mb-1">Dithering</label>
          <select
            id="dither"
            value={config.dither}
            onChange={(e) => onChange({ ...config, dither: e.target.value as DitherAlgorithm })}
            className="w-full p-2 border rounded"
          >
            {DITHER_ALGORITHMS.map((alg) => (
              <option key={alg} value={alg}>{DITHER_LABELS[alg]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={config.doHorizImage} onChange={setBoolean('doHorizImage')} className="rounded" />
          <span className="text-sm">Use horizontal image (lit from the left)</span>
        </label>
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={config.doVertImage} onChange={setBoolean('doVertImage')} className="rounded" />
          <span className="text-sm">Use vertical image (lit from the back)</span>
        </label>
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={config.serpentine} onChange={setBoolean('serpentine')} className="rounded" />
          <span className="text-sm">Serpentine dithering (fewer diagonal streaks)</span>
        </label>
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={config.isolationPosts} onChange={setBoolean('isolationPosts')} className="rounded" />
          <span className="text-sm">Isolation posts (single-colour prints: stops each image ghosting into the other)</span>
        </label>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="text-sm text-red-700 list-disc pl-5">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
    </div>
  );
}
