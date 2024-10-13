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
    ..copyResize(width: widthInPixels)
    ..grayscale();

  return (await cmd.getImage())!;
}

Future<Image> processImage(
    String filename, int widthInPixels, int numberOfColors) async {
  final image = await imageFromFilename(filename, widthInPixels);
  await File('${filename}_${widthInPixels}.png').writeAsBytes(encodePng(image));

  final ditheredImage = ditherImage(image,
      quantizer: NeuralQuantizer(image, numberOfColors: numberOfColors, samplingFactor: 1),
      kernel: DitherKernel.atkinson);

  await File('${filename}_${widthInPixels}_dithered_${numberOfColors}.png')
      .writeAsBytes(encodePng(ditheredImage));

  return ditheredImage;
}

void main() async {
  // Input image filenames, assumed to be squares.
  const horizImageFilename = 'talia_recent.jpg';//'talia_headshot.jpg';
  const vertImageFilename = 'silas_recent.jpg';//'silas_headshot.jpg';
  // How wide the image should be.  Values over 20 mean the render time will be very long.
  const widthInPixels = 100;
  const doHorizImage = true;
  const doVertImage = true;
  // The width of a cell (1 pixel) in mm. This includes the wall's width, so the flat area to be
  // shaded is cellSize-wallWidth
  const cellSize = 2.1;
  const wallWidth = 0.4;
  const bottomThk = 0.8;
  const layerHeight = 0.1;
  // The maximum height of a wall. If a pixel is black, the wall will be this many mm over the base.
  // Max height is as tall as the non-wall width of the cell, ideal light source would be at a 45 degree angle.
  const maxHeight = (cellSize - wallWidth);
  final numberOfColors = (maxHeight / layerHeight).floor();
  const border = cellSize;

  final horizImage =
  await processImage(horizImageFilename, widthInPixels, numberOfColors);

  final vertImage =
  await processImage(vertImageFilename, widthInPixels, numberOfColors);

  final outputFilename = '${widthInPixels}px_${cellSize}cell_${wallWidth}wall_${maxHeight}maxHeight.scad';
  print('writing to $outputFilename');
  final outFile = File(outputFilename);
  final outSink = outFile.openWrite();

  final leftWalls = <String>[];
  final upWalls = <String>[];

  final actualWidthMm = widthInPixels * cellSize + border * 2;
  final actualWidthIn = actualWidthMm / 25.4;

  print(
      'Including a ${border}mm border, the overall width is ${actualWidthMm}mm, '
      'or ${actualWidthIn}in');

  if (doHorizImage) {
    for (int y = 0; y < widthInPixels; y++) {
      for (int x = 0; x < widthInPixels; x++) {
        // Get the value from 0 (black) to 1 (white) of the red channel.  The image is greyscale so
        // the channels should all be equal to each other.
        final val = horizImage.getPixel(x, y).r;
        final wallHeight = (1 - val / 256) * maxHeight;

        leftWalls.add('''
  back(${border + y * cellSize})
  right(${border + x * cellSize})
  up(0.1)
    cuboid([$wallWidth+0.01, $cellSize+0.01, ${bottomThk + wallHeight - 0.1}], align=V_RIGHT+V_BACK+V_UP);''');
      }
    }
  }
  if (doVertImage) {
    for (int y = 0; y < widthInPixels; y++) {
      for (int x = 0; x < widthInPixels; x++) {
        final val = vertImage.getPixel(x, y).r;
        final wallHeight = (1 - val / 256) * maxHeight;

        upWalls.add('''
  back(${border + y * cellSize})
  right(${border + x * cellSize})
  up(0.1)
    cuboid([$cellSize+0.01, $wallWidth+0.01, ${bottomThk + wallHeight - 0.1}], align=V_RIGHT+V_BACK+V_UP);''');
      }
    }
  }

  outSink.write('''
include <BOSL/constants.scad>
use <BOSL/transforms.scad>
use <BOSL/shapes.scad>
use <BOSL/masks.scad>
use <BOSL/math.scad>
use <base.scad>

\$fs=.5;
\$fa=1;

union() {
  cuboid([${border * 2 + cellSize * horizImage.width}, ${border * 2 + cellSize * horizImage.height}, $bottomThk],
      align=V_RIGHT+V_BACK+V_UP);

  // Left walls
  ${leftWalls.join('\n')}

  // Up walls
  ${upWalls.join('\n')}
}
''');
}
