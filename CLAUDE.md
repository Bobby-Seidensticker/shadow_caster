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

## Web Application & CLI (Modern Implementation)

### Technology Stack
- **Core**: Plain TypeScript in `web/src/core/` (no DOM, no Three.js), shared by the web app and CLI
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS v3
- **CLI**: `web/cli/shadow-caster.ts` run with tsx; decodes images with jpeg-js / pngjs
- **Testing**: Vitest + Testing Library
- **Deployment**: GitHub Pages with automated CI/CD

### Development Commands
```bash
cd web
npm install
npm run dev            # Dev server (http://localhost:5173)
npm test -- --run      # Full test suite (~10s)
npm run build          # tsc -b + production build
npm run lint
npm run cli -- --horiz a.jpg --vert b.jpg -o out.stl --preview previews/   # headless STL
```

### Architecture

**Core pipeline** (`web/src/core/`, exported from `index.ts`):
1. `image.ts` - `GrayImage` (Float32 0..255), Rec.601 grayscale with alpha-over-white, area-averaging resize
2. `dither.ts` - `quantize()` to `LevelMap` (0 = white/shortest .. N-1 = black/tallest) via Floyd-Steinberg, Atkinson, Jarvis-Judice-Ninke or none; serpentine scan, gamma, error clamping
3. `layout.ts` - one cell per pixel: left wall (horiz image, lit from -X), top/back wall (vert image, lit from +Y), corner post. Image row 0 is the +Y edge
4. `heightfield.ts` - rasterize boxes (union = max height) onto a rectilinear grid
5. `mesh.ts` - watertight 2-manifold indexed mesh: top faces, walls with vertical edges split at every neighbouring height (no T-junctions), bottom fan
6. `stl.ts` - binary STL encode/decode
7. `simulate.ts` - exact parallel-light shadow casting over the heightfield; `cellBrightness()` gives the image the print shows
8. `framing.ts` - `Framing` = lead image (used whole, sets the grid's aspect ratio) + crop rectangle for the other image in its source pixels; `fitCrop()` narrows the crop to the lead's aspect ratio, centred. Images are only ever cropped, never stretched
9. `pipeline.ts` - `generateModel()` / `modelToSTL()`; `fitImages()` resizes the lead to the grid width and the cropped other image to the same grid

**Web app**: `App.tsx` decodes uploads once (`browser/decodeImageFile.ts`), then `worker/client.ts` runs `worker/build.ts` in a Web Worker (inline fallback when `Worker` is missing, e.g. jsdom). Superseded requests resolve to null. The previous result is cleared as soon as inputs change, so a stale STL can never be exported. There is intentionally no 3D viewer.

**Config** (`core/config.ts`): `ImageConfig` mirrors the Dart parameters plus `dither`, `serpentine`, `gamma`, `isolationPosts` (default off), `border` (plate margin in mm, default one cell). Framing is passed separately (`ShadowCasterInput.framing`, CLI `--lead` / `--crop`, web Framing panel). Wall top for level k = `bottomThk + (k+1) * layerHeight`; `numberOfColors = floor((cellSize - wallWidth) / layerHeight)` with an epsilon (the Dart version loses a level to float error for e.g. cell 1.2 / wall 0.4 / layer 0.1).

### Key Design Points
- **Wall junctions** (default): each corner post is just the taller of its two walls, raised only where the walls entering from the west and north are both taller (otherwise they would touch only along an edge, which is non-manifold). Along the last row and column, where one wall is left out, the post is one floor width tall (about one layer above the tallest wall) so it shades the bare strip completely and that edge never shows the other image. The far corner is the tallest wall height. With dark walls on a light base (how it is printed), only the floor shows, and the floor under either light depends only on its own image; `simulate.test.ts` proves this.
- **Isolation posts** (opt-in, for single-colour prints where wall tops show): each post is one floor width above its own taller wall, rounded to whole layers, so under either light it fully shades the other image's wall top. Without it, single-colour prints ghost each image into the other; this was the "diagonal line across the middle" bug (Red Fuji's slope showing in the Great Wave). Posts used to all be the model's maximum height, which made pillars at every corner.
- Brightness under 45° light is exactly linear in dither level; tests check this against a closed-form formula.

### Testing Strategy
- `src/core/__tests__/` - unit and property tests: mesh manifoldness via `src/test/meshCheck.ts`, dithering tone and fidelity, physics checks against the simulator
- `src/test/fixtures/` - 160px grayscale Hokusai images (public domain) used for real-photo end-to-end tests
- `cli/__tests__/` - flag parsing, STL and preview output, subprocess runs
- `src/__tests__/App.test.tsx` - upload → generate → download, plus the stale-export guard
- Core and CLI tests run in the Node environment; component tests opt in with `// @vitest-environment jsdom`
