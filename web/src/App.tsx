import { useState, useCallback, useEffect } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { ParameterControls } from './components/ParameterControls';
import { ThreeViewer } from './components/ThreeViewer';
import { ExportButton } from './components/ExportButton';
import { defaultConfig, computeImageConfig } from './types/ImageConfig';
import { processImage } from './utils/imageProcessing';
import type { ImageConfig } from './types/ImageConfig';
import type { ProcessedImageData } from './utils/imageProcessing';
import type { ShadowCasterGeometry } from './utils/geometryGenerator';

function App() {
  const [config, setConfig] = useState<ImageConfig>(defaultConfig);
  const [horizFile, setHorizFile] = useState<File | null>(null);
  const [vertFile, setVertFile] = useState<File | null>(null);
  const [horizImageData, setHorizImageData] = useState<ProcessedImageData | null>(null);
  const [vertImageData, setVertImageData] = useState<ProcessedImageData | null>(null);
  const [geometry, setGeometry] = useState<ShadowCasterGeometry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const computedConfig = computeImageConfig(config);

  const handleImagesSelected = (horiz: File | null, vert: File | null) => {
    setHorizFile(horiz);
    setVertFile(vert);
  };

  const handleGeometryReady = useCallback((newGeometry: ShadowCasterGeometry) => {
    setGeometry(newGeometry);
  }, []);

  // Process images when files or config changes
  useEffect(() => {
    const processImages = async () => {
      if (!horizFile && !vertFile) {
        setHorizImageData(null);
        setVertImageData(null);
        return;
      }

      setIsProcessing(true);
      try {
        const horizPromise = horizFile 
          ? processImage(horizFile, computedConfig.widthInPixels, computedConfig.numberOfColors)
          : Promise.resolve(null);
        
        const vertPromise = vertFile 
          ? processImage(vertFile, computedConfig.widthInPixels, computedConfig.numberOfColors)
          : Promise.resolve(null);

        const [horizData, vertData] = await Promise.all([horizPromise, vertPromise]);
        
        setHorizImageData(horizData);
        setVertImageData(vertData);
      } catch (error) {
        console.error('Error processing images:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    processImages();
  }, [horizFile, vertFile, computedConfig.widthInPixels, computedConfig.numberOfColors]);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Shadow Caster Web</h1>
          <p className="text-lg text-gray-600">
            Generate 3D printable objects that cast different shadows from different angles
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ImageUpload
              onImagesSelected={handleImagesSelected}
              horizFile={horizFile}
              vertFile={vertFile}
            />
            
            <ParameterControls
              config={config}
              onChange={setConfig}
            />
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">3D Preview</h2>
              <div className="aspect-square bg-gray-200 rounded relative">
                <ThreeViewer
                  horizImageData={horizImageData}
                  vertImageData={vertImageData}
                  config={computedConfig}
                  onGeometryReady={handleGeometryReady}
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded">
                    <div className="text-lg">Processing images...</div>
                  </div>
                )}
              </div>
            </div>

            <ExportButton
              geometry={geometry}
              config={computedConfig}
              disabled={isProcessing}
            />
          </div>
        </div>

        {(horizFile || vertFile) && (
          <div className="mt-6 p-4 bg-white rounded-lg shadow">
            <h3 className="font-semibold mb-2">Status</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Images:</strong> {[horizFile?.name, vertFile?.name].filter(Boolean).join(', ')}</p>
              <p><strong>Resolution:</strong> {computedConfig.widthInPixels}px</p>
              <p><strong>Colors:</strong> {computedConfig.numberOfColors}</p>
              <p><strong>Max Height:</strong> {computedConfig.maxHeight.toFixed(2)}mm</p>
              {geometry && (
                <p><strong>Total Walls:</strong> {geometry.leftWalls.length + geometry.upWalls.length}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;