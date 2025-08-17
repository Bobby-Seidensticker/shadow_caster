# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shadow Caster is a dual-implementation project that generates 3D printable objects capable of casting different shadows from different angles. The repository contains both a proof-of-concept Dart script and a modern web application.

### Repository Structure
- **`/` (root)** - Original Dart implementation with OpenSCAD output
- **`/web/`** - Modern React/TypeScript web application with Three.js
- **Live Demo**: https://bobby-seidensticker.github.io/shadow_caster/

## Dart Implementation (Original)

### Prerequisites
- Dart SDK (≥2.12.0 ≤3.2.6): https://dart.dev/get-dart
- OpenSCAD (preferably 2024+ development snapshots): https://openscad.org/downloads.html
- BOSL OpenSCAD library: https://github.com/revarbat/BOSL/wiki

### Development Commands
```bash
# Install Dart dependencies
dart pub get

# Generate OpenSCAD file from images
dart main.dart

# Enable Fast CSG in OpenSCAD for faster rendering
# Go to OpenSCAD -> Edit menu -> Preferences -> Features tab -> check fast-csg
```

### Dart Code Architecture

**ImageConfig Class** (`main.dart:79-129`): Central configuration object containing all parameters:
- Image filenames and processing settings
- Physical dimensions (cellSize, wallWidth, bottomThk, layerHeight)
- Output settings (widthInPixels, maxHeight calculation)
- Multiple predefined configurations (defaultConfig, p2Config, fuji, etc.)

**Image Processing Pipeline**:
- `imageFromFilename()`: Loads, resizes, and converts images to grayscale
- `processImage()`: Applies dithering and quantization for discrete height levels
- `myImageFromImage()`: Converts to internal 2D array format

**OpenSCAD Generation** (`generate()` function):
- Processes both horizontal and vertical shadow images
- Creates wall geometries based on pixel brightness values
- Outputs BOSL-based OpenSCAD code with proper transformations

## Web Application (Modern Implementation)

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **3D Engine**: Three.js with WebGL rendering
- **Styling**: Tailwind CSS v3.4.17
- **Testing**: Vitest + Testing Library
- **Deployment**: GitHub Pages with automated CI/CD

### Development Commands
```bash
cd web
npm install           # Install dependencies
npm run dev          # Start development server (http://localhost:5173)
npm test             # Run test suite
npm run build        # Build for production
npm run lint         # Run ESLint
```

### Web Application Architecture

**Core Components**:
- `App.tsx` - Main application with state management
- `ImageUpload.tsx` - File upload interface for 1-2 images
- `ParameterControls.tsx` - UI for all configuration parameters
- `ThreeViewer.tsx` - 3D rendering with Three.js
- `ExportButton.tsx` - STL file download functionality

**Key Utilities**:
- `imageProcessing.ts` - Canvas-based image resize, grayscale, dithering
- `geometryGenerator.ts` - Convert pixels to Three.js geometry
- `stlExporter.ts` - Export Three.js geometry as STL files

**Type System**:
- `ImageConfig` interface mirrors Dart implementation
- `ProcessedImageData` for image processing pipeline
- `ShadowCasterGeometry` for 3D geometry representation

### Important Implementation Details

**Image Processing Pipeline**:
1. File upload via HTML5 File API
2. Canvas-based resize and grayscale conversion
3. Floyd-Steinberg dithering for discrete height levels
4. Real-time processing when parameters change

**3D Rendering**:
- Each pixel becomes a Three.js BoxGeometry
- Wall heights calculated from pixel brightness (0-255 → 0-maxHeight)
- OrbitControls for camera interaction
- Automatic scene bounds calculation and camera positioning

**Build Configuration**:
- Vite configured for GitHub Pages deployment (`base: '/shadow_caster/'`)
- Manual chunk splitting for optimized loading
- TypeScript strict mode with proper type-only imports

### Common Development Tasks

**Adding New Parameters**:
1. Update `ImageConfig` interface in `types/ImageConfig.ts`
2. Add form controls in `ParameterControls.tsx`
3. Update `computeImageConfig()` if computed values needed
4. Test with existing presets

**Modifying Geometry Generation**:
- Core logic in `geometryGenerator.ts` mirrors Dart implementation
- Wall positioning follows exact same formula as Dart version
- Test changes with simple images first

**Deployment**:
- GitHub Actions automatically deploys on push to main branch
- Builds run tests first, deploy only if tests pass
- Live site updates within 2-3 minutes of successful push

### Testing Strategy
- Image processing utilities have comprehensive unit tests
- Component tests for UI interactions and file handling
- Build tests ensure production deployment works
- Manual testing recommended for 3D rendering and STL export

### Key Parameters (Same as Dart)
- `widthInPixels`: Controls resolution (values >20 cause long render times)
- `cellSize`: Width of each pixel cell in mm (includes wall width)
- `wallWidth`: Thickness of walls within each cell
- `maxHeight`: Maximum wall height for black pixels
- `layerHeight`: Height increment for each brightness level
- `numberOfColors`: Discrete height levels (auto-calculated or manual override)

### Performance Considerations
- Three.js geometry creation scales with widthInPixels²
- Image processing is CPU-bound but cached until parameters change
- STL export uses geometry merging for optimal file size
- Development builds include source maps, production builds are optimized

### Debugging Tips
- Use browser dev tools for Three.js scene inspection
- Image processing includes debug output for height distributions
- Vite dev server has fast HMR for rapid iteration
- Test STL files in slicing software before printing