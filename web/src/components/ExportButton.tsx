import { useState } from 'react';
import { exportToSTL } from '../utils/stlExporter';
import { generateShadowCasterGeometry } from '../utils/geometryGenerator';
import type { ShadowCasterGeometry } from '../utils/geometryGenerator';
import type { ComputedImageConfig } from '../types/ImageConfig';
import type { ProcessedImageData } from '../utils/imageProcessing';

interface ExportButtonProps {
  geometry: ShadowCasterGeometry | null;
  config: ComputedImageConfig;
  disabled?: boolean;
  horizImageData: ProcessedImageData | null;
  vertImageData: ProcessedImageData | null;
}

export function ExportButton({ geometry, config, disabled, horizImageData, vertImageData }: ExportButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = () => {
    // If geometry is already available, use it
    if (geometry) {
      try {
        exportToSTL(geometry, config);
      } catch (error) {
        console.error('Error exporting STL:', error);
        alert('Error exporting STL file. Please try again.');
      }
      return;
    }

    // Generate geometry on-demand if viewer was disabled
    if (!horizImageData && !vertImageData) {
      return;
    }

    setIsGenerating(true);
    try {
      const generatedGeometry = generateShadowCasterGeometry(
        horizImageData,
        vertImageData,
        config
      );
      exportToSTL(generatedGeometry, config);
    } catch (error) {
      console.error('Error generating/exporting STL:', error);
      alert('Error exporting STL file. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const hasImages = horizImageData || vertImageData;
  const canExport = !disabled && hasImages;

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-3">Export</h3>

      <button
        onClick={handleExport}
        disabled={!canExport || isGenerating}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
      >
        {isGenerating
          ? 'Generating STL...'
          : !hasImages
            ? 'Upload images to export'
            : 'Download STL'}
      </button>

      {geometry && (
        <div className="mt-3 text-sm text-gray-600">
          <p><strong>File:</strong> {config.outputFilename}</p>
          <p><strong>Walls:</strong> {geometry.leftWalls.length + geometry.upWalls.length}</p>
          <p><strong>Dimensions:</strong> {Math.round(config.border * 2 + config.cellSize * config.widthInPixels)}mm</p>
        </div>
      )}

      {!geometry && hasImages && (
        <div className="mt-3 text-sm text-gray-500 italic">
          Viewer disabled - geometry will be generated on export
        </div>
      )}
    </div>
  );
}