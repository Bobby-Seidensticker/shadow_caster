import { describe, it, expect, vi } from 'vitest';
import { 
  resizeAndGrayscale, 
  ditherImage, 
  roundToLayerHeight
} from '../imageProcessing';
import type { ProcessedImageData } from '../imageProcessing';

// Mock HTMLImageElement
const createMockImage = (width: number, height: number) => {
  const img = {
    width,
    height,
    src: ''
  } as HTMLImageElement;
  return img;
};

// Mock canvas context
const createMockContext = (imageData: Uint8ClampedArray) => {
  return {
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: imageData,
      width: 2,
      height: 2
    })
  };
};

// Mock document.createElement
(globalThis as any).document = {
  createElement: vi.fn().mockReturnValue({
    width: 0,
    height: 0,
    getContext: vi.fn()
  })
} as any;

describe('imageProcessing', () => {
  describe('roundToLayerHeight', () => {
    it('should round height to nearest layer height', () => {
      expect(roundToLayerHeight(0.15, 0.1)).toBeCloseTo(0.1);
      expect(roundToLayerHeight(0.25, 0.1)).toBeCloseTo(0.3);
      expect(roundToLayerHeight(0.05, 0.1)).toBeCloseTo(0.1);
    });

    it('should handle exact multiples', () => {
      expect(roundToLayerHeight(0.2, 0.1)).toBe(0.2);
      expect(roundToLayerHeight(0.5, 0.05)).toBe(0.5);
    });
  });

  describe('resizeAndGrayscale', () => {
    it('should create canvas with correct dimensions', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(createMockContext(new Uint8ClampedArray([
          255, 255, 255, 255, // white pixel
          0, 0, 0, 255,       // black pixel
          128, 128, 128, 255, // gray pixel
          255, 0, 0, 255      // red pixel
        ])))
      };

      (globalThis as any).document.createElement = vi.fn().mockReturnValue(mockCanvas);
      (globalThis as any).URL = { revokeObjectURL: vi.fn() } as any;

      const img = createMockImage(4, 4);
      const result = resizeAndGrayscale(img, 2);

      expect(mockCanvas.width).toBe(2);
      expect(mockCanvas.height).toBe(2);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
    });

    it('should convert RGB to grayscale correctly', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(createMockContext(new Uint8ClampedArray([
          255, 255, 255, 255, // white -> 255
          0, 0, 0, 255,       // black -> 0
          255, 0, 0, 255,     // red -> ~76
          0, 255, 0, 255      // green -> ~149
        ])))
      };

      (globalThis as any).document.createElement = vi.fn().mockReturnValue(mockCanvas);
      (globalThis as any).URL = { revokeObjectURL: vi.fn() } as any;

      const img = createMockImage(2, 2);
      const result = resizeAndGrayscale(img, 2);

      expect(result.data[0][0]).toBe(255); // white
      expect(result.data[0][1]).toBe(0);   // black
      expect(result.data[1][0]).toBe(76);  // red (0.299 * 255)
      expect(result.data[1][1]).toBe(150); // green (0.587 * 255 = 149.685, rounded to 150)
    });
  });

  describe('ditherImage', () => {
    it('should quantize colors to specified levels', () => {
      const imageData: ProcessedImageData = {
        data: [[128, 64], [192, 32]],
        width: 2,
        height: 2
      };

      const result = ditherImage(imageData, 3); // 3 colors means levels 0, 127.5, 255

      // Check that all values are quantized to valid levels (0, 127.5, 255)
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const value = result.data[y][x];
          const quantized = Math.round(value / 127.5) * 127.5;
          expect([0, 127.5, 255]).toContain(quantized);
        }
      }
    });

    it('should preserve image dimensions', () => {
      const imageData: ProcessedImageData = {
        data: [[100, 150], [200, 50]],
        width: 2,
        height: 2
      };

      const result = ditherImage(imageData, 4);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.data.length).toBe(2);
      expect(result.data[0].length).toBe(2);
    });

    it('should not modify original data', () => {
      const originalData = [[128, 64], [192, 32]];
      const imageData: ProcessedImageData = {
        data: originalData.map(row => [...row]), // Deep copy
        width: 2,
        height: 2
      };

      ditherImage(imageData, 3);

      // Original should be unchanged
      expect(originalData[0][0]).toBe(128);
      expect(originalData[0][1]).toBe(64);
    });
  });
});