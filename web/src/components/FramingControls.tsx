import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { cropOverlay, fitCrop, fullRect, otherSlot } from '../core/framing';
import type { CropRect, Framing, ImageSlot } from '../core/framing';
import { resizeArea } from '../core/image';
import type { GrayImage } from '../core/image';
import { GrayCanvas } from './GrayCanvas';

interface FramingControlsProps {
  horiz: GrayImage;
  vert: GrayImage;
  framing: Framing;
  onChange: (framing: Framing) => void;
}

const SLOT_LABELS: Record<ImageSlot, string> = {
  horiz: 'Horizontal (lit from the left)',
  vert: 'Vertical (lit from the back)',
};

const CORNERS: { key: keyof CropRect; label: string }[] = [
  { key: 'x0', label: 'Left (x)' },
  { key: 'y0', label: 'Top (y)' },
  { key: 'x1', label: 'Right (x)' },
  { key: 'y1', label: 'Bottom (y)' },
];

// Largest side of the crop preview, in image pixels.
const PREVIEW_SIZE = 480;

// Picks which image is used whole and where the other one is cropped to match its aspect ratio.
export function FramingControls({ horiz, vert, framing, onChange }: FramingControlsProps) {
  const images = { horiz, vert };
  const lead = images[framing.lead];
  const followSlot = otherSlot(framing.lead);
  const follow = images[followSlot];
  const requested = framing.crop ?? fullRect(follow);

  // Scale the (possibly very large) source down once; only the overlay is redrawn per crop edit.
  const small = useMemo(() => {
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(follow.width, follow.height));
    return resizeArea(follow, Math.max(1, Math.round(follow.width * scale)), Math.max(1, Math.round(follow.height * scale)));
  }, [follow]);

  let used: CropRect | null = null;
  let error: string | null = null;
  try {
    used = fitCrop(follow, lead.width / lead.height, framing.crop);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const s = small.width / follow.width;
  const overlay = used && cropOverlay(small, { x0: used.x0 * s, y0: used.y0 * s, x1: used.x1 * s, y1: used.y1 * s }, PREVIEW_SIZE);

  const setCorner = (key: keyof CropRect) => (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...framing, crop: { ...requested, [key]: e.target.value === '' ? NaN : Number(e.target.value) } });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold">Framing</h2>

      <fieldset>
        <legend className="block text-sm font-medium mb-1">Keep the aspect ratio of</legend>
        {(['horiz', 'vert'] as const).map((slot) => (
          <label key={slot} className="flex items-center space-x-2">
            <input
              type="radio"
              name="lead"
              value={slot}
              checked={framing.lead === slot}
              onChange={() => onChange({ lead: slot, crop: null })}
            />
            <span className="text-sm">
              {SLOT_LABELS[slot]} — {images[slot].width} x {images[slot].height} px
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <h3 className="text-sm font-medium mb-1">Crop of the {followSlot === 'horiz' ? 'horizontal' : 'vertical'} image</h3>
        {overlay && <GrayCanvas image={overlay} label="Crop of the other image" />}
        <div className="grid grid-cols-4 gap-2 mt-2">
          {CORNERS.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`crop-${key}`} className="block text-xs font-medium mb-1">{label}</label>
              <input
                id={`crop-${key}`}
                type="number"
                step={1}
                value={Number.isNaN(requested[key]) ? '' : requested[key]}
                onChange={setCorner(key)}
                className="w-full p-1 border rounded text-sm"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Corners in source pixels. The largest part of this region with the other image's aspect ratio
          is used, centred; nothing is stretched.
        </p>
        {used && (
          <p className="text-xs text-gray-700 mt-1" data-testid="crop-used">
            Using {used.x0},{used.y0} → {used.x1},{used.y1} ({used.x1 - used.x0} x {used.y1 - used.y0} px)
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-700 mt-1">{error}</p>}
        <button
          type="button"
          onClick={() => onChange({ ...framing, crop: null })}
          className="mt-2 px-3 py-1 text-sm border rounded bg-white hover:bg-gray-100"
        >
          Reset crop
        </button>
      </div>
    </div>
  );
}
