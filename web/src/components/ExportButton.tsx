import type { GenerateSuccess } from '../worker/build';

interface ExportButtonProps {
  // The model for the current inputs, or null if there is none yet (or it is out of date).
  result: GenerateSuccess | null;
  busy: boolean;
  hasImages: boolean;
  onDownload: (result: GenerateSuccess) => void;
}

export function ExportButton({ result, busy, hasImages, onDownload }: ExportButtonProps) {
  const label = !hasImages
    ? 'Upload images to export'
    : busy || !result
      ? 'Generating…'
      : 'Download STL';

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-3">Export</h2>
      <button
        onClick={() => result && onDownload(result)}
        disabled={!result || busy}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
      >
        {label}
      </button>

      {result && (
        <dl className="mt-3 text-sm text-gray-600 grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="font-semibold">File</dt>
          <dd className="break-all">{result.filename}</dd>
          <dt className="font-semibold">Grid</dt>
          <dd>{result.stats.cols} × {result.stats.rows} cells, {result.numberOfColors} height levels</dd>
          <dt className="font-semibold">Size</dt>
          <dd>
            {result.stats.widthMm.toFixed(1)} × {result.stats.depthMm.toFixed(1)} × {result.stats.heightMm.toFixed(2)} mm
          </dd>
          <dt className="font-semibold">Mesh</dt>
          <dd>
            {result.stats.triangles.toLocaleString()} triangles, {(result.stats.stlBytes / 1e6).toFixed(1)} MB
          </dd>
          <dt className="font-semibold">Generated in</dt>
          <dd>{Math.round(result.ms)} ms</dd>
        </dl>
      )}
    </div>
  );
}
