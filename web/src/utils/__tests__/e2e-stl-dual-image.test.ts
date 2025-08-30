import { describe, it, expect, beforeAll, vi } from 'vitest';
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

describe('Dual Image End-to-End STL Generation', () => {
  let capturedSTLData: any = null;
  let capturedMimeType = '';
  
  beforeAll(() => {
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Intercept Blob creation to capture STL content
    mockBlob.mockImplementation((content: any[], options: any) => {
      if (content && content[0]) {
        capturedSTLData = content[0];
        capturedMimeType = options.type;
      }
      return { content, options };
    });
    
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  it('should generate STL with both horizontal and vertical shadows from 2x2 patterns', async () => {
    // Create horizontal shadow pattern: [[0,255],[255,0]] - diagonal
    const horizImageData: ProcessedImageData = {
      data: [
        [0, 255],    // Row 0: black, white
        [255, 0]     // Row 1: white, black
      ],
      width: 2,
      height: 2
    };

    // Create vertical shadow pattern: [[255,0],[0,255]] - opposite diagonal
    const vertImageData: ProcessedImageData = {
      data: [
        [255, 0],    // Row 0: white, black
        [0, 255]     // Row 1: black, white
      ],
      width: 2,
      height: 2
    };


    const config: ComputedImageConfig = {
      horizImageFilename: 'test-horiz.png',
      vertImageFilename: 'test-vert.png',
      widthInPixels: 2,
      cellSize: 5.0,
      wallWidth: 0.8,
      maxHeight: 2.0,
      layerHeight: 0.2,
      bottomThk: 1.0,
      border: 0.0,
      numberOfColors: 11, // 0.2mm layers in 2mm = 10 levels + base
      numberOfColorsOverride: 0,
      doHorizImage: true,
      doVertImage: true,
      outputFilename: 'test-dual-diagonal-2x2.stl'
    };

    // Generate geometry using real code with both images
    const geometry = generateShadowCasterGeometry(horizImageData, vertImageData, config);

    // Verify basic geometry structure
    expect(geometry.base).toBeDefined();
    expect(geometry.leftWalls).toHaveLength(4);  // 2x2 = 4 walls from horizontal image
    expect(geometry.upWalls).toHaveLength(4);    // 2x2 = 4 walls from vertical image

    // Check wall heights for both horizontal and vertical walls
    const leftWallHeights = geometry.leftWalls.map(wall => wall.size[2]);
    const upWallHeights = geometry.upWalls.map(wall => wall.size[2]);
    
    const leftUniqueHeights = [...new Set(leftWallHeights)].sort((a, b) => a - b);
    const upUniqueHeights = [...new Set(upWallHeights)].sort((a, b) => a - b);
    
    expect(leftUniqueHeights).toHaveLength(2);  // Two heights for diagonal pattern
    expect(upUniqueHeights).toHaveLength(2);    // Two heights for opposite diagonal

    console.log(`📊 Dual Image Geometry stats:`);
    console.log(`   Base size: ${geometry.base.size.join(' x ')} mm`);
    console.log(`   Left walls (horizontal shadow): ${geometry.leftWalls.length}`);
    console.log(`   Up walls (vertical shadow): ${geometry.upWalls.length}`);
    console.log(`   Left wall heights: ${leftWallHeights.map(h => h.toFixed(1)).join(', ')} mm`);
    console.log(`   Up wall heights: ${upWallHeights.map(h => h.toFixed(1)).join(', ')} mm`);
    console.log(`   Left unique heights: ${leftUniqueHeights.map(h => h.toFixed(1)).join(', ')} mm`);
    console.log(`   Up unique heights: ${upUniqueHeights.map(h => h.toFixed(1)).join(', ')} mm`);

    // Export STL using the real export function
    exportToSTL(geometry, config, 'test-dual-diagonal-2x2.stl');

    // Verify the mock functions were called correctly
    expect(mockLink.download).toBe('test-dual-diagonal-2x2.stl');
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockBlob).toHaveBeenCalled();

    // Verify STL data was captured
    expect(capturedSTLData).toBeTruthy();
    expect(capturedMimeType).toBe('application/octet-stream');

    console.log(`📁 STL format: ${typeof capturedSTLData === 'string' ? 'ASCII' : 'Binary'}`);
    console.log(`📁 Data type: ${Object.prototype.toString.call(capturedSTLData)}`);
    console.log(`📏 Data size: ${capturedSTLData.byteLength || capturedSTLData.length} bytes`);

    // Save to file for external inspection
    const outputPath = path.join(process.cwd(), 'test-output', 'dual-diagonal-2x2-binary.stl');
    
    // Handle binary STL data (DataView)
    let buffer: Buffer;
    
    if (capturedSTLData instanceof DataView) {
      buffer = Buffer.from(capturedSTLData.buffer, capturedSTLData.byteOffset, capturedSTLData.byteLength);
    } else if (capturedSTLData instanceof ArrayBuffer) {
      buffer = Buffer.from(capturedSTLData);
    } else if (capturedSTLData instanceof Uint8Array) {
      buffer = Buffer.from(capturedSTLData);
    } else {
      buffer = Buffer.from(capturedSTLData);
    }
    
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`📏 Buffer length: ${buffer.length} bytes`);
    
    if (buffer.length >= 84) {
      // Binary STL structure: 80-byte header + 4-byte triangle count + triangle data
      const triangleCount = buffer.readUInt32LE(80);
      console.log(`📁 Binary STL contains ${triangleCount} triangular facets`);
      console.log(`📐 Expected file size: ${80 + 4 + (triangleCount * 50)} bytes`);
      
      // Should have more triangles than single image (base + 4 left walls + 4 up walls = 9 boxes)
      // Each box has 12 triangles, so 9 * 12 = 108 triangles
      expect(triangleCount).toBe(108);
      expect(buffer.length).toBe(80 + 4 + (triangleCount * 50));
    } else {
      expect(buffer.length).toBeGreaterThan(0);
    }
    
    console.log(`📁 Dual image STL saved to: ${outputPath}`);
    console.log(`📏 File size: ${fs.statSync(outputPath).size} bytes`);

    // Verify the dual image creates different geometry than single image
    // Generate single image geometry for comparison
    const singleImageGeometry = generateShadowCasterGeometry(horizImageData, null, config);
    
    expect(geometry.leftWalls).toHaveLength(singleImageGeometry.leftWalls.length); // Same left walls
    expect(geometry.upWalls.length).toBeGreaterThan(singleImageGeometry.upWalls.length); // More up walls
    
    console.log(`📊 Comparison with single image:`);
    console.log(`   Single image up walls: ${singleImageGeometry.upWalls.length}`);
    console.log(`   Dual image up walls: ${geometry.upWalls.length}`);
    console.log(`   Additional walls from vertical image: ${geometry.upWalls.length - singleImageGeometry.upWalls.length}`);
  });

  it('should create different shadow patterns with different image combinations', () => {
    // Test uniform vs. diagonal patterns
    const uniformImage: ProcessedImageData = {
      data: [
        [128, 128],
        [128, 128]
      ],
      width: 2,
      height: 2
    };

    const diagonalImage: ProcessedImageData = {
      data: [
        [0, 255],
        [255, 0]
      ],
      width: 2,
      height: 2
    };

    const config: ComputedImageConfig = {
      horizImageFilename: 'test-horiz.png',
      vertImageFilename: 'test-vert.png',
      widthInPixels: 2,
      cellSize: 4.0,
      wallWidth: 0.6,
      maxHeight: 1.5,
      layerHeight: 0.15,
      bottomThk: 0.8,
      border: 4.0,
      numberOfColors: 11,
      numberOfColorsOverride: 0,
      doHorizImage: true,
      doVertImage: true,
      outputFilename: 'test-comparison.stl'
    };

    // Test different combinations
    const uniformBoth = generateShadowCasterGeometry(uniformImage, uniformImage, config);
    const diagonalBoth = generateShadowCasterGeometry(diagonalImage, diagonalImage, config);
    const mixed = generateShadowCasterGeometry(uniformImage, diagonalImage, config);

    // All should have same number of walls
    expect(uniformBoth.leftWalls).toHaveLength(4);
    expect(uniformBoth.upWalls).toHaveLength(4);
    expect(diagonalBoth.leftWalls).toHaveLength(4);
    expect(diagonalBoth.upWalls).toHaveLength(4);
    expect(mixed.leftWalls).toHaveLength(4);
    expect(mixed.upWalls).toHaveLength(4);

    // But should have different height distributions
    const uniformLeftHeights = [...new Set(uniformBoth.leftWalls.map(w => w.size[2]))];
    const diagonalLeftHeights = [...new Set(diagonalBoth.leftWalls.map(w => w.size[2]))];
    const mixedLeftHeights = [...new Set(mixed.leftWalls.map(w => w.size[2]))];
    const mixedUpHeights = [...new Set(mixed.upWalls.map(w => w.size[2]))];

    expect(uniformLeftHeights).toHaveLength(1);  // All same height
    expect(diagonalLeftHeights).toHaveLength(2); // Two different heights
    expect(mixedLeftHeights).toHaveLength(1);    // Uniform horizontal
    expect(mixedUpHeights).toHaveLength(2);      // Diagonal vertical

    console.log(`📊 Pattern comparison:`);
    console.log(`   Uniform both: ${uniformLeftHeights.length} left heights, ${[...new Set(uniformBoth.upWalls.map(w => w.size[2]))].length} up heights`);
    console.log(`   Diagonal both: ${diagonalLeftHeights.length} left heights, ${[...new Set(diagonalBoth.upWalls.map(w => w.size[2]))].length} up heights`);
    console.log(`   Mixed: ${mixedLeftHeights.length} left heights, ${mixedUpHeights.length} up heights`);
  });
});
