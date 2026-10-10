import { useEffect, useRef } from 'react';
import type { GrayImage } from '../core/image';

interface GrayCanvasProps {
  image: GrayImage;
  label: string;
}

// Draws a grayscale image scaled up with crisp pixels.
export function GrayCanvas({ image, label }: GrayCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pixels = ctx.createImageData(image.width, image.height);
    for (let i = 0; i < image.data.length; i++) {
      const v = Math.max(0, Math.min(255, Math.round(image.data[i])));
      pixels.data[i * 4] = v;
      pixels.data[i * 4 + 1] = v;
      pixels.data[i * 4 + 2] = v;
      pixels.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }, [image]);

  return (
    <canvas
      ref={ref}
      width={image.width}
      height={image.height}
      role="img"
      aria-label={label}
      className="w-full h-auto rounded border border-gray-300"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
