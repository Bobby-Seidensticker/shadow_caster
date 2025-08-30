import { describe, it, expect, vi } from 'vitest';
import { generateShadowCasterGeometry } from '../geometryGenerator';
import { exportToSTL } from '../stlExporter';
import type { ProcessedImageData } from '../imageProcessing';
import type { ComputedImageConfig } from '../../types/ImageConfig';

// Mock DOM
let capturedBlobs: { data: any, type: string }[] = [];

const mockLink = {
  href: '',
  download: '',
  click: vi.fn()
};

(globalThis as any).document = {
  createElement: vi.fn().mockReturnValue(mockLink),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  }
};

(globalThis as any).Blob = vi.fn().mockImplementation((content: any[], options: any) => {
  capturedBlobs.push({ data: content[0], type: options.type });
  return { content, options };
});

(globalThis as any).URL = {
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn()
};

describe('STL File Size Comparison', () => {
  it('should show the difference between ASCII and binary STL formats', () => {
    // Create test geometry
    const imageData: ProcessedImageData = {
      data: [
        [0, 255, 0],      // Row 0: black, white, black
        [255, 0, 255],    // Row 1: white, black, white  
        [0, 255, 0]       // Row 2: black, white, black
      ],
      width: 3,
      height: 3
    };

    const config: ComputedImageConfig = {
      horizImageFilename: 'test-horiz.png',
      vertImageFilename: 'test-vert.png',
      widthInPixels: 3,
      cellSize: 4.0,
      wallWidth: 0.6,
      maxHeight: 3.0,
      layerHeight: 0.3,
      bottomThk: 1.2,
      border: 1.5,
      numberOfColors: 11,
      numberOfColorsOverride: 0,
      doHorizImage: true,
      doVertImage: false,
      outputFilename: 'size-test.stl'
    };

    // Generate geometry
    const geometry = generateShadowCasterGeometry(imageData, null, config);
    
    // Clear captured blobs
    capturedBlobs = [];
    
    // Export with current binary setting
    exportToSTL(geometry, config, 'test-binary.stl');
    
    expect(capturedBlobs).toHaveLength(1);
    const binaryBlob = capturedBlobs[0];
    
    console.log(`📊 STL Export Results:`);
    console.log(`   Geometry: ${geometry.leftWalls.length} walls + 1 base`);
    
    if (typeof binaryBlob.data === 'string') {
      console.log(`   Format: ASCII text`);
      console.log(`   Size: ${binaryBlob.data.length} characters`);
      console.log(`   MIME type: ${binaryBlob.type}`);
      
      // Count triangles in ASCII format
      const triangleCount = (binaryBlob.data.match(/facet normal/g) || []).length;
      console.log(`   Triangles: ${triangleCount}`);
    } else {
      console.log(`   Format: Binary`);
      console.log(`   Size: ${binaryBlob.data.byteLength || binaryBlob.data.length} bytes`);
      console.log(`   MIME type: ${binaryBlob.type}`);
      
      // Binary STL header: 80 bytes + 4-byte triangle count + (50 bytes per triangle)
      const expectedSize = 80 + 4 + (50 * (geometry.leftWalls.length + 1) * 12); // 12 triangles per box
      console.log(`   Expected size: ~${expectedSize} bytes`);
    }
    
    // Verify the export worked
    expect(binaryBlob.data).toBeTruthy();
    expect(binaryBlob.type).toBe('application/octet-stream');
  });
});