# Shadow Caster (web + CLI)

Turns one or two images into a printable STL. Lit from the left it shows the first image in
shadow; lit from the back it shows the second.

## Command line

```bash
npm install
npm run cli -- --horiz great_wave.jpg --vert red_fuji.jpg --preset fuji --preview previews/
```

Paths are resolved from the directory you run `npm` in. `--preview` writes PNGs of the
dithered wall heights and a ray-cast simulation of each shadow, so you can check the result before
printing. Run `npm run cli -- --help` for every option.

## Web app

```bash
npm run dev     # http://localhost:5173
npm run build   # production build into dist/ (deployed to GitHub Pages from main)
```

The app has no 3D viewer. Generation runs in a Web Worker and the page shows 2D previews of the
dithered heights and simulated shadows, plus a download button.

## How it works

Each pixel is a cell with two thin walls: one on its left edge for the horizontal image, one on
its back edge for the vertical image. Darker pixels get taller walls, so the wall casts a longer
shadow across the cell's floor. At 45° the shadow length equals the wall height, and the tallest wall
equals the open floor width, so a black pixel's floor is fully shaded.

The pipeline lives in `src/core/`, which is plain TypeScript with no DOM dependency:

| Module | Job |
| --- | --- |
| `image.ts` | Grayscale conversion and area-averaging resize |
| `dither.ts` | Quantize to N heights with Floyd–Steinberg / Atkinson / JJN, serpentine scan |
| `layout.ts` | Cells to wall boxes, including isolation posts |
| `heightfield.ts` | Rasterize boxes onto a rectilinear grid |
| `mesh.ts` | Watertight 2-manifold mesh, no T-junctions |
| `stl.ts` | Binary STL encode/decode |
| `simulate.ts` | Exact shadow casting, used for previews and tests |
| `pipeline.ts` | Glue: images + config → model + stats |

**Isolation posts:** where a cell's two walls meet, the post is raised one floor width above
the tallest wall. Under either light it fully shades the top of the other image's wall. Without
this, the other wall's top surface is partly lit, by an amount that depends on its height, so each
image shows a ghost of the other. With Hokusai's Red Fuji as the second image, that ghost is a
diagonal line across the middle of the first image. The option can be turned off.

## Tests

```bash
npm test -- --run
```

The tests cover the physics as well as the code:
- Simulated cell brightness is exactly linear in the dither level for every preset.
- The two images are completely independent of each other.
- Simulated shadows from the real Hokusai fixtures correlate above 0.97 with the source photos.
- Every generated mesh is closed, 2-manifold, consistently wound, has Euler characteristic 2, and
  its volume matches the heightfield.
- Dithering preserves tone and beats plain posterization on a real photo.
