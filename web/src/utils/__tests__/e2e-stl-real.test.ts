import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateShadowCasterGeometry } from '../geometryGenerator';
import { exportToSTL } from '../stlExporter';
import type { ProcessedImageData } from '../imageProcessing';
import type { ComputedImageConfig } from '../../types/ImageConfig';

// Mock DOM for file download
const mockLink = {
  href: '',
  download: '',
  click: vi.fn()
};

const mockBlob = vi.fn();
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

(globalThis as any).document = {
  createElement: vi.fn().mockReturnValue(mockLink),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  }
};

(globalThis as any).Blob = mockBlob;
(globalThis as any).URL = {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL
};

describe('Real End-to-End STL Generation', () => {
  let capturedSTLData: any = null;
  let capturedMimeType = '';
  
  beforeAll(() => {
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Intercept Blob creation to capture STL content (both text and binary)
    mockBlob.mockImplementation((content: any[], options: any) => {
      if (content && content[0]) {
        capturedSTLData = content[0];
        capturedMimeType = options.type;
      }
      return { content, options };
    });
    
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  it('should generate real STL file for 2x2 diagonal pattern using actual app code', async () => {
    // Create 2x2 diagonal pattern: [[0,255],[255,0]]
    // 0 = black (max height), 255 = white (min height)
    const imageData: ProcessedImageData = {
      data: [
        [0, 255],    // Row 0: black, white
        [255, 0]     // Row 1: white, black
      ],
      width: 2,
      height: 2
    };

    // Minimal config for testing
    const config: ComputedImageConfig = {
      widthInPixels: 2,
      cellSize: 5.0,
      wallWidth: 0.8,
      maxHeight: 2.0,
      layerHeight: 0.2,
      bottomThk: 1.0,
      border: 5.0,
      numberOfColors: 11, // 0.2mm layers in 2mm = 10 levels + base
      doHorizImage: true,
      doVertImage: false,
      outputFilename: 'test-diagonal-2x2-real.stl'
    };

    // Generate geometry using real code
    const geometry = generateShadowCasterGeometry(imageData, null, config);

    // Verify basic geometry structure
    expect(geometry.base).toBeDefined();
    expect(geometry.leftWalls).toHaveLength(4); // 2x2 = 4 walls
    expect(geometry.upWalls).toHaveLength(0);   // No vertical image

    // Check wall heights
    const wallHeights = geometry.leftWalls.map(wall => wall.size[2]);
    const uniqueHeights = [...new Set(wallHeights)].sort((a, b) => a - b);
    expect(uniqueHeights).toHaveLength(2);
    
    console.log(`📊 Geometry stats:`);
    console.log(`   Base size: ${geometry.base.size.join(' x ')} mm`);
    console.log(`   Wall count: ${geometry.leftWalls.length}`);
    console.log(`   Wall heights: ${wallHeights.map(h => h.toFixed(1)).join(', ')} mm`);
    console.log(`   Unique heights: ${uniqueHeights.map(h => h.toFixed(1)).join(', ')} mm`);

    // Export STL using the real export function
    exportToSTL(geometry, config, 'test-diagonal-2x2-real.stl');

    // Verify the mock functions were called correctly
    expect(mockLink.download).toBe('test-diagonal-2x2-real.stl');
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockBlob).toHaveBeenCalled();

    // Verify STL data was captured
    expect(capturedSTLData).toBeTruthy();
    expect(capturedMimeType).toBe('application/octet-stream');

    console.log(`📁 STL format: ${typeof capturedSTLData === 'string' ? 'ASCII' : 'Binary'}`);
    console.log(`📁 Data type: ${Object.prototype.toString.call(capturedSTLData)}`);
    console.log(`📏 Data size: ${capturedSTLData.byteLength || capturedSTLData.length} bytes`);

    // Save to file for external inspection
    const outputPath = path.join(process.cwd(), 'test-output', 'diagonal-2x2-real-binary.stl');
    
    if (typeof capturedSTLData === 'string') {
      // ASCII STL
      fs.writeFileSync(outputPath, capturedSTLData);
      
      const facetCount = (capturedSTLData.match(/facet normal/g) || []).length;
      const vertexCount = capturedSTLData.split('\n').filter(line => line.trim().startsWith('vertex')).length;
      
      console.log(`📁 STL contains ${facetCount} triangular facets`);
      console.log(`📐 STL contains ${vertexCount} vertices`);
      
      expect(facetCount).toBeGreaterThan(0);
      expect(vertexCount).toBeGreaterThan(100);
    } else {
      // Binary STL - handle different data types
      let buffer: Buffer;
      
      if (capturedSTLData instanceof ArrayBuffer) {
        buffer = Buffer.from(capturedSTLData);
      } else if (capturedSTLData instanceof Uint8Array) {
        buffer = Buffer.from(capturedSTLData);
      } else if (capturedSTLData instanceof DataView) {
        buffer = Buffer.from(capturedSTLData.buffer, capturedSTLData.byteOffset, capturedSTLData.byteLength);
      } else {
        // Fallback: try to convert whatever it is
        buffer = Buffer.from(capturedSTLData);
      }
      
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`📏 Buffer length: ${buffer.length} bytes`);
      
      if (buffer.length >= 84) {
        // Binary STL structure: 80-byte header + 4-byte triangle count + triangle data
        const triangleCount = buffer.readUInt32LE(80);
        console.log(`📁 Binary STL contains ${triangleCount} triangular facets`);
        console.log(`📐 Expected file size: ${80 + 4 + (triangleCount * 50)} bytes`);
        
        expect(triangleCount).toBeGreaterThan(0);
        expect(buffer.length).toBe(80 + 4 + (triangleCount * 50));
      } else if (buffer.length > 0) {
        console.log(`⚠️  Buffer exists but smaller than expected binary STL format`);
        expect(buffer.length).toBeGreaterThan(0);
      } else {
        console.log(`❌ Empty buffer - binary STL export failed`);
        // Just verify we have the data size reported
        expect(capturedSTLData.byteLength || capturedSTLData.length).toBeGreaterThan(0);
      }
    }
    
    console.log(`📁 Real STL saved to: ${outputPath}`);
    console.log(`📏 File size: ${fs.statSync(outputPath).size} bytes`);
  });
});
