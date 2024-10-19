import 'dart:io';
import 'dart:math';
import 'dart:isolate';
import 'package:image/image.dart';

// stub for doing it with packed circles instead of a grid
// class ImageCircle {
//   const int dmax = 5;
//   const int bmin = 1;

//   final Image image;
//   final int mm;
//   // mm per pixel
//   int mmpp;
//   // small pixels per big pixel
//   int sppbp;
//   // mm per big pixel
//   int mmpbp = dmax + bmin;

//   final List<String> holes = <String>[];

//   // Image must be square
//   ImageCircle(this.image, this.mm) {
//     mmpp = mm / image.width;
//     bp_w = mm / (dmax + bmin);
//     bp_h = mm / ((dmax + bmin) * sin(60 * 2*pi / 360));
//   }

//   /// Just takes the val for blue so only works for already greyscale images
//   int _lumAt(int x, int y) =>
//     image.data[y * image.width + x] % 256;
// }

// Load the input image, scale it to be widthInPixels wide preserving aspect ratio, and convert to
// grayscale.
Future<Image> imageFromFilename(String filename, int widthInPixels) async {
  final cmd = Command()
    ..decodeImageFile(filename)
    ..copyResize(width: widthInPixels, maintainAspect: false)
    ..grayscale();

  return (await cmd.getImage())!;
}

Future<Image> processImage(
    String filename, int widthInPixels, int numberOfColors) async {
  final image = await imageFromFilename(filename, widthInPixels);
  await File('${filename}_${widthInPixels}.png').writeAsBytes(encodePng(image));

  final ditheredImage = ditherImage(image,
      quantizer: NeuralQuantizer(image,
          numberOfColors: numberOfColors, samplingFactor: 1),
      kernel: DitherKernel.atkinson);

  await File('${filename}_${widthInPixels}_dithered_${numberOfColors}.png')
      .writeAsBytes(encodePng(ditheredImage));

  return ditheredImage;
}

String format(double n) {
  return n.toStringAsFixed(n.truncateToDouble() == n ? 0 : 2);
}

// Configuration class to hold all the constant variables
class ImageConfig {
  // Input image filenames, assumed to be squares.
  final String horizImageFilename;
  final String vertImageFilename;
  // How wide the image should be.  Values over 20 mean the render time will be very long.
  final int widthInPixels;
  final bool doHorizImage;
  final bool doVertImage;
  // The width of a cell (1 pixel) in mm. This includes the wall's width, so the flat area to be
  // shaded is cellSize-wallWidth
  final double cellSize;
  final double wallWidth;
  final double bottomThk;
  final double layerHeight;
  // The maximum height of a wall. If a pixel is black, the wall will be this many mm over the base.
  // Max height is as tall as the non-wall width of the cell, ideal light source would be at a 45 degree angle.
  double get maxHeight => cellSize - wallWidth;
  double get border => cellSize;

  // Calculated number of colors based on maxHeight and layerHeight
  //
  // Subtract one because every cell must have a wall to avoid blank spots.
  int get numberOfColors => (maxHeight / layerHeight).floor() - 1;

  String get outputFilename =>
      '${widthInPixels}px_${format(cellSize)}cell_${format(wallWidth)}wall_${format(maxHeight)}maxHeight_${horizImageFilename}_${vertImageFilename}.scad';

  // Constructor to initialize all the variables
  const ImageConfig({
    this.horizImageFilename = 'talia_recent.jpg',
    this.vertImageFilename = 'silas_recent.jpg',
    this.widthInPixels = 100,
    this.doHorizImage = true,
    this.doVertImage = true,
    this.cellSize = 2.1,
    this.wallWidth = 0.4,
    this.bottomThk = 0.8,
    this.layerHeight = 0.1,
  });
}

void main() async {
  // Create an instance of ImageConfig with your desired constants
  const defaultConfig = ImageConfig();
  const p2Config = ImageConfig(
      widthInPixels: 50,
      cellSize: 1,
      wallWidth: 0.2,
      bottomThk: 0.4,
      layerHeight: 0.05);
  const p3Config = ImageConfig(
      widthInPixels: 85,
      cellSize: 1.1,
      wallWidth: 0.22,
      bottomThk: 0.6,
      layerHeight: 0.05);
  const fuji = ImageConfig(
      horizImageFilename: 'great_wave.jpg',
      vertImageFilename: 'red_fuji.jpg',
      widthInPixels: 150,
      cellSize: 1.1,
      wallWidth: 0.22,
      bottomThk: 0.6,
      layerHeight: 0.05);

  await generate(fuji);
}

Future<void> generate(ImageConfig config) async {
  final horizImage = await processImage(
      config.horizImageFilename, config.widthInPixels, config.numberOfColors);

  final vertImage = await processImage(
      config.vertImageFilename, config.widthInPixels, config.numberOfColors);

  print('writing to ${config.outputFilename}');
  final outFile = File(config.outputFilename);
  final outSink = outFile.openWrite();

  final leftWalls = <String>[];
  final upWalls = <String>[];

  final actualWidthMm =
      config.widthInPixels * config.cellSize + config.border * 2;
  final actualWidthIn = actualWidthMm / 25.4;

  print(
      'Including a ${config.border}mm border, the overall width is ${actualWidthMm}mm, '
      'or ${actualWidthIn}in');

  int horizEndY = 0;
  int vertEndY = 0;
  if (horizImage.height > vertImage.height) {
    horizEndY = vertImage.height;
    vertEndY = vertImage.height;
  } else {
    horizEndY = horizImage.height;
    vertEndY = horizImage.height;
  }

  if (config.doHorizImage) {
    for (int y = 0; y < horizEndY; y++) {
      for (int x = 0; x < horizImage.width; x++) {
        // Get the value from 0 (black) to 1 (white) of the red channel.  The image is greyscale so
        // the channels should all be equal to each other.
        final val = horizImage.getPixel(x, y).r;
        final wallHeight =
            (1 - val / 256) * (config.maxHeight - config.layerHeight);

        leftWalls.add('''
          back(${config.border + (horizEndY - y) * config.cellSize})
          right(${config.border + (x + 1) * config.cellSize})
          up(0.1)
          cuboid([${config.wallWidth + 0.01}, ${config.cellSize + 0.01}, ${config.bottomThk - 0.1 + wallHeight + config.layerHeight}], align=V_RIGHT+V_BACK+V_UP);''');
      }
    }
  }
  if (config.doVertImage) {
    for (int y = 0; y < vertEndY; y++) {
      for (int x = 0; x < vertImage.width; x++) {
        final val = vertImage.getPixel(x, y).r;
        final wallHeight =
            (1 - val / 256) * (config.maxHeight - config.layerHeight);

        upWalls.add('''
          back(${config.border + (vertEndY - y) * config.cellSize})
          right(${config.border + (x + 1) * config.cellSize})
          up(0.1)
          cuboid([${config.cellSize + 0.01}, ${config.wallWidth + 0.01}, ${config.bottomThk - 0.1 + wallHeight + config.layerHeight}], align=V_RIGHT+V_BACK+V_UP);''');
      }
    }
  }

  outSink.write('''
    include <BOSL/constants.scad>
    use <BOSL/transforms.scad>
    use <BOSL/shapes.scad>
    use <BOSL/masks.scad>
    use <BOSL/math.scad>

    \$fs=.5;
    \$fa=1;

    union() {
      /*cuboid([${config.border * 2 + config.cellSize * horizImage.width + 20}, ${config.border * 2 + config.cellSize * horizEndY + 20}, 
      right(10)
      back(10)*/
      union() {
        cuboid([${config.border * 2 + config.cellSize * (horizImage.width + 2)}, ${config.border * 2 + config.cellSize * (horizEndY + 2)}, ${config.bottomThk}],
          align=V_RIGHT+V_BACK+V_UP);

        // Left walls
        ${leftWalls.join('\n')}

        // Up walls
        ${upWalls.join('\n')}
      }
    }
    ''');
}
