# Shadow Caster

Shadow Caster is a tool that generates 3D printable objects capable of casting different shadows from different angles. Originally implemented in Dart, this repository now includes both the original proof-of-concept and a modern web application.

## 🌐 **Try it Online**

**Live Demo:** https://bobby-seidensticker.github.io/shadow_caster/

Upload your images and generate STL files directly in your browser - no installation required!

## 📁 **Project Structure**

- **`/` (root)** - Original Dart implementation (proof of concept)
- **`/web/`** - Modern React/TypeScript web application

## 🚀 **Web Application & CLI**

### ✨ **Features**
- **🖼️ Image Upload** - Select 1-2 images for horizontal/vertical shadows
- **⚙️ Parameters** - Cell size, wall width, layer height, dithering algorithm, gamma, and more
- **👁️ Shadow Preview** - 2D previews of the dithered heights and a simulated shadow for each light
- **📁 STL Export** - Watertight, 2-manifold binary STL; generation runs in a Web Worker in well under a second
- **💻 Headless CLI** - Same engine from the command line, with optional preview PNGs
- **⚡ Client-side Processing** - No server required, runs entirely in your browser

### 🛠️ **Technology Stack**
- **Core:** Plain TypeScript (no DOM), shared by the web app and the CLI
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Testing:** Vitest + Testing Library
- **Deployment:** GitHub Pages with automated CI/CD

### 🏃‍♂️ **Local Development**

```bash
cd web
npm install
npm run dev     # Start development server
npm test        # Run tests
npm run build   # Build for production
npm run cli -- --horiz great_wave.jpg --vert red_fuji.jpg --preset fuji --preview previews/
```

See [web/README.md](web/README.md) for how the geometry works.

## 📋 **Original Dart Implementation**

The original proof-of-concept requires:

### Requirements
- [Dart SDK](https://dart.dev/get-dart)
- [OpenSCAD](https://openscad.org/downloads.html) (preferably 2024+ development snapshots)
- [BOSL OpenSCAD library](https://github.com/revarbat/BOSL/wiki)

### Usage
```bash
dart pub get
dart main.dart
# Open output.scad in OpenSCAD, render (F6), export (F7)
```

Enable Fast CSG in OpenSCAD (Edit → Preferences → Features → fast-csg) for faster rendering.

## 🎨 **How It Works**

1. **Image Processing** - Images are resized, converted to grayscale, and dithered for discrete height levels
2. **Geometry Generation** - Each pixel becomes a cell with two walls whose heights come from brightness
3. **Shadow Casting** - Different wall arrangements create distinct shadows when lit from different angles
4. **3D Printing** - Export as STL for physical fabrication

## 🤝 **Contributing**

Contributions are welcome! The web application is actively developed, while the Dart version serves as the reference implementation.

## 📄 **License**

See [LICENSE](LICENSE) file for details.

---

**Live Demo:** https://bobby-seidensticker.github.io/shadow_caster/