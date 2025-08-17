export interface ProcessedImageData {
  data: number[][];
  width: number;
  height: number;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function resizeAndGrayscale(
  img: HTMLImageElement, 
  targetWidth: number
): ProcessedImageData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Calculate height maintaining aspect ratio
  const aspectRatio = img.height / img.width;
  const targetHeight = Math.round(targetWidth * aspectRatio);
  
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  // Draw and resize image
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;
  
  // Convert to grayscale and create 2D array
  const data: number[][] = [];
  for (let y = 0; y < targetHeight; y++) {
    data[y] = [];
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      
      // Convert to grayscale using luminance formula
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[y][x] = gray;
    }
  }
  
  // Clean up
  URL.revokeObjectURL(img.src);
  
  return {
    data,
    width: targetWidth,
    height: targetHeight
  };
}

export function ditherImage(
  imageData: ProcessedImageData, 
  numberOfColors: number
): ProcessedImageData {
  const { data, width, height } = imageData;
  const dithered: number[][] = data.map(row => [...row]);
  
  // Calculate color levels
  const levels = numberOfColors - 1;
  const step = 255 / levels;
  
  // Floyd-Steinberg dithering
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const oldPixel = dithered[y][x];
      const newPixel = Math.round(oldPixel / step) * step;
      dithered[y][x] = newPixel;
      
      const error = oldPixel - newPixel;
      
      // Distribute error to neighboring pixels
      if (x + 1 < width) {
        dithered[y][x + 1] += error * 7 / 16;
      }
      if (y + 1 < height) {
        if (x - 1 >= 0) {
          dithered[y + 1][x - 1] += error * 3 / 16;
        }
        dithered[y + 1][x] += error * 5 / 16;
        if (x + 1 < width) {
          dithered[y + 1][x + 1] += error * 1 / 16;
        }
      }
    }
  }
  
  return {
    data: dithered,
    width,
    height
  };
}

export function roundToLayerHeight(height: number, layerHeight: number): number {
  return Math.round(height / layerHeight) * layerHeight;
}

export async function processImage(
  file: File,
  widthInPixels: number,
  numberOfColors: number
): Promise<ProcessedImageData> {
  const img = await loadImageFromFile(file);
  const resized = resizeAndGrayscale(img, widthInPixels);
  const dithered = ditherImage(resized, numberOfColors);
  return dithered;
}