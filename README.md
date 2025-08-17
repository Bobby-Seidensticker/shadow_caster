# Shadow Caster

Shadow Caster is a tool that generates 3D printable objects capable of casting different shadows from different angles. Originally implemented in Dart, this repository now includes both the original proof-of-concept and a modern web application.

## 🌐 **Try it Online**

**Live Demo:** https://yourusername.github.io/shadow_caster/

Upload your images and generate STL files directly in your browser - no installation required!

## 📁 **Project Structure**

- **`/` (root)** - Original Dart implementation (proof of concept)
- **`/web/`** - Modern React/TypeScript web application

## 🚀 **Web Application**

The web version provides all the functionality of the original Dart script with these advantages:

### ✨ **Features**
- **🖼️ Image Upload** - Drag & drop or select 1-2 images for horizontal/vertical shadows
- **⚙️ Real-time Parameters** - Adjust cell size, wall width, layer height, and more
- **🎯 Live 3D Preview** - Interactive Three.js viewer with orbit controls
- **📁 STL Export** - Download ready-to-print STL files
- **📱 Responsive Design** - Works on desktop, tablet, and mobile
- **⚡ Client-side Processing** - No server required, runs entirely in your browser

### 🛠️ **Technology Stack**
- **Frontend:** React 18 + TypeScript + Vite
- **3D Engine:** Three.js with WebGL rendering
- **Styling:** Tailwind CSS
- **Testing:** Vitest + Testing Library
- **Deployment:** GitHub Pages with automated CI/CD

### 🏃‍♂️ **Local Development**

```bash
cd web
npm install
npm run dev     # Start development server
npm test        # Run tests
npm run build   # Build for production
```

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
2. **Geometry Generation** - Each pixel becomes a 3D wall with height based on brightness
3. **Shadow Casting** - Different wall arrangements create distinct shadows when lit from different angles
4. **3D Printing** - Export as STL for physical fabrication

## 🤝 **Contributing**

Contributions are welcome! The web application is actively developed, while the Dart version serves as the reference implementation.

## 📄 **License**

See [LICENSE](LICENSE) file for details.

---

**Live Demo:** https://yourusername.github.io/shadow_caster/