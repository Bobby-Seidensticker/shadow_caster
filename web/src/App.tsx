import { useEffect, useRef, useState } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { ParameterControls } from './components/ParameterControls';
import { PreviewPanel } from './components/PreviewPanel';
import { FramingControls } from './components/FramingControls';
import { ExportButton } from './components/ExportButton';
import { defaultConfig, validateConfig } from './core/config';
import type { ImageConfig } from './core/config';
import { defaultFraming } from './core/framing';
import type { Framing } from './core/framing';
import type { GrayImage } from './core/image';
import { decodeImageFile } from './browser/decodeImageFile';
import { downloadBytes } from './browser/download';
import { GeneratorClient } from './worker/client';
import type { GenerateSuccess } from './worker/build';

// Wait for typing / slider drags to settle before regenerating.
const DEBOUNCE_MS = 200;

interface AppProps {
  // Injected by tests; defaults to the browser decoder.
  decodeImage?: (file: File) => Promise<GrayImage>;
}

function useDecodedImage(file: File | null, decode: (file: File) => Promise<GrayImage>) {
  const [state, setState] = useState<{ file: File | null; image: GrayImage | null; error: string | null }>(
    { file: null, image: null, error: null },
  );
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    decode(file).then(
      (image) => !cancelled && setState({ file, image, error: null }),
      (error) => !cancelled && setState({ file, image: null, error: `${file.name}: ${error instanceof Error ? error.message : 'could not decode'}` }),
    );
    return () => {
      cancelled = true;
    };
  }, [file, decode]);
  // Never hand out an image decoded from a previously selected file.
  return state.file === file && file ? state : { file, image: null, error: null };
}

function App({ decodeImage = decodeImageFile }: AppProps) {
  const [config, setConfig] = useState<ImageConfig>(defaultConfig);
  const [framing, setFraming] = useState<Framing>(defaultFraming);
  const [horizFile, setHorizFile] = useState<File | null>(null);
  const [vertFile, setVertFile] = useState<File | null>(null);
  const horiz = useDecodedImage(horizFile, decodeImage);
  const vert = useDecodedImage(vertFile, decodeImage);
  const [result, setResult] = useState<GenerateSuccess | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientRef = useRef<GeneratorClient | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const client = new GeneratorClient();
    clientRef.current = client;
    return () => client.dispose();
  }, []);

  const configValid = validateConfig(config).length === 0;
  const horizImage = config.doHorizImage ? horiz.image : null;
  const vertImage = config.doVertImage ? vert.image : null;
  const hasImages = horizImage !== null || vertImage !== null;

  useEffect(() => {
    // Anything shown from here on must match these inputs; drop the old model straight away so it
    // can never be exported against new settings.
    setResult(null);
    setGenerateError(null);
    if (!hasImages || !configValid) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      clientRef.current?.submit({ id, horiz: horizImage, vert: vertImage, config, framing }).then((response) => {
        if (!response || response.id !== requestId.current) return;
        setBusy(false);
        if (response.ok) setResult(response);
        else setGenerateError(response.error);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [horizImage, vertImage, config, framing, hasImages, configValid]);

  const errors = [horiz.error, vert.error, generateError].filter((e): e is string => e !== null);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Shadow Caster</h1>
          <p className="text-lg text-gray-600">
            Generate 3D printable objects that cast different shadows from different angles
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ImageUpload
              onImagesSelected={(h, v) => {
                // A crop is in the old image's pixels; start a new image from all of it.
                if (h !== horizFile || v !== vertFile) setFraming((f) => ({ ...f, crop: null }));
                setHorizFile(h);
                setVertFile(v);
              }}
              horizFile={horizFile}
              vertFile={vertFile}
            />
            {horizImage && vertImage && (
              <FramingControls horiz={horizImage} vert={vertImage} framing={framing} onChange={setFraming} />
            )}
            <ParameterControls config={config} onChange={setConfig} />
          </div>

          <div className="space-y-6">
            <ExportButton
              result={result}
              busy={busy}
              hasImages={hasImages}
              onDownload={(r) => downloadBytes(r.stl, r.filename)}
            />
            {errors.length > 0 && (
              <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errors.map((e) => <p key={e}>{e}</p>)}
              </div>
            )}
            {result && <PreviewPanel horiz={result.horizPreview} vert={result.vertPreview} />}
            <div className="p-4 bg-white rounded-lg shadow text-sm text-gray-600 space-y-2">
              <h2 className="text-lg font-semibold text-gray-800">Printing &amp; viewing</h2>
              <p>
                Print flat with the layer height set above. Light it from the left at about 45° to see
                the horizontal image, and from the back edge to see the vertical one. A bare LED or
                phone flashlight a metre or more away gives the sharpest shadows.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
