# Shadow caster

main.dart is a dart script which reads in two .jpgs and makes an OpenSCAD script which can output an
.stl model that does the shadow thing.

Fiddle with all the parameters at the top of the main function.

## Requirements

- Dart: https://dart.dev/get-dart
- OpenSCAD: https://openscad.org/downloads.html  (preferrably one of the development snapshots that start with 2024)
- BOSL, an OpenSCAD library: https://github.com/revarbat/BOSL/wiki
- My dart script's dependencies (just run `dart pub get` to get them)

Enable Fast CSG in OpenSCAD -> Edit menu -> Preferences -> `Features` tab -> fast-csg checkbox.
Speeds up render time from minutes to seconds.

## Workflow

- Fiddle with the settings in main.dart.
- Run `dart main.dart`
- Open `output.scad` in OpenSCAD
- Render the output (F6).  
- Save the output (F7).

Voila, you have your .stl to print.

