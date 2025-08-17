# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shadow Caster is a Dart script that generates 3D printable shadow casting objects. It reads two JPG images and creates an OpenSCAD script that outputs STL models capable of casting different shadows depending on the light direction.

## Development Workflow

### Prerequisites
- Dart SDK (≥2.12.0 ≤3.2.6): https://dart.dev/get-dart
- OpenSCAD (preferably 2024+ development snapshots): https://openscad.org/downloads.html
- BOSL OpenSCAD library: https://github.com/revarbat/BOSL/wiki

### Setup Commands
```bash
# Install Dart dependencies
dart pub get

# Enable Fast CSG in OpenSCAD for faster rendering
# Go to OpenSCAD -> Edit menu -> Preferences -> Features tab -> check fast-csg
```

### Main Development Commands
```bash
# Generate OpenSCAD file from images
dart main.dart

# The script outputs to a filename based on parameters, typically:
# {width}px_{cellSize}cell_{wallWidth}wall_{maxHeight}maxHeight_{horizImage}_{vertImage}_pluswalls_{shouldDoPlusWalls}.scad
```

### OpenSCAD Workflow
1. Open the generated `.scad` file in OpenSCAD
2. Render with F6 (may take seconds to minutes depending on complexity)
3. Export STL with F7

## Code Architecture

### Main Components

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

### Key Parameters
- `widthInPixels`: Controls resolution (values >20 cause very long render times)
- `cellSize`: Width of each pixel cell in mm (includes wall width)
- `wallWidth`: Thickness of walls within each cell
- `maxHeight`: Maximum wall height for black pixels (calculated from numberOfColors * layerHeight)
- `layerHeight`: Height increment for each brightness level

### Configuration Patterns
The main function contains several predefined configurations for different use cases:
- `defaultConfig`: Standard settings
- `p2Config`, `p3Config`: Different scale variants
- `fuji`: Japanese art example with specific images
- `p4Config`: Family photos configuration

To modify parameters, edit the configuration passed to `generate()` in `main()` or create new ImageConfig instances.