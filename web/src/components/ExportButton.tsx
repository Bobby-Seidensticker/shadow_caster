import { exportToSTL } from '../utils/stlExporter';
import type { ShadowCasterGeometry } from '../utils/geometryGenerator';
import type { ComputedImageConfig } from '../types/ImageConfig';

interface ExportButtonProps {
  geometry: ShadowCasterGeometry | null;
  config: ComputedImageConfig;
  disabled?: boolean;
}

export function ExportButton({ geometry, config, disabled }: ExportButtonProps) {
  const handleExport = () => {
    if (!geometry) return;

    try {
      exportToSTL(geometry, config);
    } catch (error) {
      console.error('Error exporting STL:', error);
      alert('Error exporting STL file. Please try again.');
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-3">Export</h3>
      
      <button
        onClick={handleExport}
        disabled={disabled || !geometry}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
      >
        {!geometry ? 'Upload images to export' : 'Download STL'}
      </button>

      {geometry && (
        <div className="mt-3 text-sm text-gray-600">
          <p><strong>File:</strong> {config.outputFilename}</p>
          <p><strong>Walls:</strong> {geometry.leftWalls.length + geometry.upWalls.length}</p>
          <p><strong>Dimensions:</strong> {Math.round(config.border * 2 + config.cellSize * config.widthInPixels)}mm</p>
        </div>
      )}
    </div>
  );
}