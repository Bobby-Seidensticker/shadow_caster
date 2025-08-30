import React from 'react';
import { presetConfigs } from '../types/ImageConfig';
import type { ImageConfig } from '../types/ImageConfig';

interface ParameterControlsProps {
  config: ImageConfig;
  onChange: (config: ImageConfig) => void;
}

export function ParameterControls({ config, onChange }: ParameterControlsProps) {
  const handleChange = (field: keyof ImageConfig) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.type === 'checkbox' 
      ? (e.target as HTMLInputElement).checked
      : e.target.type === 'number'
      ? parseFloat(e.target.value) || 0
      : e.target.value;
    
    onChange({ ...config, [field]: value });
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetName = e.target.value as keyof typeof presetConfigs;
    if (presetName && presetConfigs[presetName]) {
      onChange({ ...presetConfigs[presetName] });
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold">Parameters</h2>
      
      <div>
        <label className="block text-sm font-medium mb-1">Preset Configurations</label>
        <select
          onChange={handlePresetChange}
          className="w-full p-2 border rounded"
        >
          <option value="">Custom</option>
          <option value="default">Default</option>
          <option value="p2">P2 (Small)</option>
          <option value="p3">P3 (Medium)</option>
          <option value="fuji">Fuji (Japanese Art)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Width (pixels)</label>
          <input
            type="number"
            value={config.widthInPixels}
            onChange={handleChange('widthInPixels')}
            className="w-full p-2 border rounded"
            min="10"
            max="200"
            step="1"
          />
          <p className="text-xs text-gray-500">Higher values = longer render times</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Cell Size (mm)</label>
          <input
            type="number"
            value={config.cellSize}
            onChange={handleChange('cellSize')}
            className="w-full p-2 border rounded"
            min="0.1"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Wall Width (mm)</label>
          <input
            type="number"
            value={config.wallWidth}
            onChange={handleChange('wallWidth')}
            className="w-full p-2 border rounded"
            min="0.1"
            step="0.05"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bottom Thickness (mm)</label>
          <input
            type="number"
            value={config.bottomThk}
            onChange={handleChange('bottomThk')}
            className="w-full p-2 border rounded"
            min="0.1"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Layer Height (mm)</label>
          <input
            type="number"
            value={config.layerHeight}
            onChange={handleChange('layerHeight')}
            className="w-full p-2 border rounded"
            min="0.01"
            step="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Colors Override (0=auto)</label>
          <input
            type="number"
            value={config.numberOfColorsOverride}
            onChange={handleChange('numberOfColorsOverride')}
            className="w-full p-2 border rounded"
            min="0"
            step="1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={config.doHorizImage}
            onChange={handleChange('doHorizImage')}
            className="rounded"
          />
          <span className="text-sm">Generate horizontal shadows</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={config.doVertImage}
            onChange={handleChange('doVertImage')}
            className="rounded"
          />
          <span className="text-sm">Generate vertical shadows</span>
        </label>

      </div>
    </div>
  );
}