import type { ImagePreview } from '../worker/build';
import { GrayCanvas } from './GrayCanvas';

interface PreviewPanelProps {
  horiz: ImagePreview | null;
  vert: ImagePreview | null;
}

function PreviewRow({ title, preview }: { title: string; preview: ImagePreview }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        <figure>
          <GrayCanvas image={preview.dithered} label={`${title} wall heights`} />
          <figcaption className="text-xs text-gray-500 mt-1">Wall heights (dithered)</figcaption>
        </figure>
        <figure>
          <GrayCanvas image={preview.shadow} label={`${title} simulated shadow`} />
          <figcaption className="text-xs text-gray-500 mt-1">Simulated shadow at 45°</figcaption>
        </figure>
      </div>
    </div>
  );
}

export function PreviewPanel({ horiz, vert }: PreviewPanelProps) {
  if (!horiz && !vert) return null;
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white">
      <h2 className="text-lg font-semibold">Preview</h2>
      {horiz && <PreviewRow title="Lit from the left" preview={horiz} />}
      {vert && <PreviewRow title="Lit from the back" preview={vert} />}
    </div>
  );
}
