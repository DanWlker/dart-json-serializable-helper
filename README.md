# dart-json-serializable-helper README

To help generate @JsonSerializable classes

## Credits

[VsCode Flutter Helper](https://github.com/aksharpatel47/vscode_flutter_helper)

## Features

### Snippet to generate @JsonSerializable class `jsi`

   ![jsi](media/jsi.gif)

### Hover over a class and press `Ctrl + .` on Windows, `Cmd + .` on Mac to convert a class to a JsonSerializable class

   ![qucikfix](media/quickfix.gif)

### Run Code Gen for @JSONSerializable annotated classes

![code gen](media/build.gif)

### Have build runner watch the @JSONSerializable annotated classes and generate code on changes

![code gen & watch](media/watch.gif)

## Release Notes

### 1.0.0

Initial release

### 1.0.1

Fix Readme not showing `jsi` command

### 1.0.2

Fix filename part not retrieved correctly on macos
Fix missing `$` symbol for `FromJson` generation
Exclude imports and annotation if exist
