import * as vscode from "vscode";
import * as path from "path";
import { findProjectName, removeEnd } from "./dart_parser/utils";
import { DataClassGenerator } from "./dart_parser/data_class_generator";
import { DartClass } from "./dart_parser/dart-class";
import { Imports } from "./dart_parser/imports";

export function activate(context: vscode.ExtensionContext) {
  console.log("dart-json-serializable-helper is now active!");

  // Quick fix provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "dart",
      new QuickFixJsonSerializableProvider()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dartJsonSerializableHelper.quickFixJsonSerializable",
      (document, range) => {
        quickFixJsonSerializableDataClassVer(document, range);
      }
    )
  );

  findProjectName();
}

class QuickFixJsonSerializableProvider implements vscode.CodeActionProvider {
  getClass(generator: DataClassGenerator, lineNumber: number) {
    for (let clazz of generator.clazzes) {
      let startsAtLine = clazz.startsAtLine;
      // let endsAtLine = clazz.endsAtLine;

      if (startsAtLine === null) {
        //|| endsAtLine === null) {
        continue;
      }

      if (startsAtLine === lineNumber) {
        // && endsAtLine >= lineNumber) {
        return clazz;
      }
    }
    return null;
  }

  private isCursorOnClass(
    clazz: DartClass | null,
    lineNumber: number
  ): boolean {
    if (clazz === null) {
      return false;
    }

    if (!clazz.isValid) {
      return false;
    }

    return lineNumber === clazz.startsAtLine;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const codeActions: vscode.CodeAction[] = [];
    let generator = new DataClassGenerator(document.getText());
    let lineNumber = range.start.line + 1;
    let clazz = this.getClass(generator, lineNumber);

    // Check if the cursor position is on a Dart class and only has one class in the file
    if (
      generator.clazzes.length === 1 &&
      this.isCursorOnClass(clazz, lineNumber)
    ) {
      const action = new vscode.CodeAction(
        "Generate @JsonSerializable class template",
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        title: "Generate @JsonSerializable class template",
        command: "dartJsonSerializableHelper.quickFixJsonSerializable",
        arguments: [document, range],
      };
      codeActions.push(action);
    }

    return codeActions;
  }
}

function quickFixJsonSerializableDataClassVer(
  document: vscode.TextDocument,
  range: vscode.Range
) {
  let documentText = document.getText();
  // Constant stuff that we will definitely need
  const fileUri = document.uri;
  const fileName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
  let jsonSerializableHeaderImport =
    "import 'package:json_annotation/json_annotation.dart';";
  let jsonSerializableHeaderPart = `part '${fileName}.g.dart';`;
  let jsonSerializableHeaderNotation = "@JsonSerializable()";
  // prettier-ignore
  let jsonSerializableCombinedText: string = `\
${documentText.includes(jsonSerializableHeaderImport) ? "" : `${jsonSerializableHeaderImport}\n`}\
${documentText.includes(jsonSerializableHeaderPart) ? "" : `${jsonSerializableHeaderPart}\n`}\

${jsonSerializableHeaderNotation}`;

  // Start using class generator
  let generator = new DataClassGenerator(documentText);
  let firstDartClass = generator.clazzes[0];

  // imports
  let imports = removeEnd(generator.imports.formatted, "\n");

  // whole class line
  let classNameLine = removeEnd(firstDartClass.getClassNameLine(), "\n");

  // class name
  let className = firstDartClass.name;

  // variables
  let variables = removeEnd(firstDartClass.propertiesStringList.join(""), "\n");

  // constructor
  let constructor = firstDartClass.getConstructor();
  if (!/^\s/.test(constructor)) {
    let constructorArray = constructor.split(/\n/);
    var newConstructorArray: string[] = [];
    constructorArray.forEach(function (element) {
      newConstructorArray.push("\t" + element);
    });
    constructor = newConstructorArray.join("\n");
  }

  // Generate the class declaration and constructor snippet
  // prettier-ignore
  const finalText = `\
${imports}
${jsonSerializableCombinedText}
${classNameLine}
${variables}

${constructor}

\tfactory ${className}.fromJson(Map<String, dynamic> json) =>
\t\t\t_$${className}FromJson(json);
\tMap<String, dynamic> toJson() => _$${className}ToJson(this);
}
	`;

  // Create a new TextEdit to replace the entire document content
  overwriteDocument(document, finalText);
}

function quickFixJsonSerializable(
  document: vscode.TextDocument,
  range: vscode.Range
) {
  // Get the current line where the cursor is positioned
  const lineIndex = range.start.line;
  const lineText = document.lineAt(lineIndex).text;
  const classRegex = lineText.match(/class\s+(\w+)/);
  const fileUri = document.uri;
  const fileName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));

  let jsonSerializableHeaderImport =
    "import 'package:json_annotation/json_annotation.dart';";
  let jsonSerializableHeaderPart = `part '${fileName}.g.dart';`;
  let jsonSerializableHeaderNotation = "@JsonSerializable()";

  let textBeforeClass = "";

  if (range.start.line > 0) {
    const currentPosition = range.start;
    const lineNumber = currentPosition.line;
    const fullText = document.getText();
    const lines = fullText.split("\n");
    textBeforeClass = lines.slice(0, lineNumber).join("\n").trim();
  }

  // prettier-ignore
  textBeforeClass = `\
${textBeforeClass}
${textBeforeClass.includes(jsonSerializableHeaderImport) ? "" : `${jsonSerializableHeaderImport}\n`}\
${textBeforeClass.includes(jsonSerializableHeaderPart) ? "" : `${jsonSerializableHeaderPart}\n`}\
${textBeforeClass.includes(jsonSerializableHeaderNotation) ? "":`\n${jsonSerializableHeaderNotation}\n`}\
  `;

  if (classRegex && fileName) {
    const className = classRegex[1];

    const variablesAvailable = getVariableMatchesFromClass(document.getText());

    let variableSection = "";
    let constructorVariableSection = "";
    for (const variable of variablesAvailable) {
      const variableName = variable.at(-1)?.trim() ?? "";
      const variableType = variable.at(-2)?.trim() ?? "";
      const variableConstFinal = variable.at(-3)?.trim() ?? "";
      const variableLate = variable.at(-4)?.trim() ?? "";

      // prettier-ignore
      variableSection += `\t${variableLate ? variableLate + " " : ""}${variableConstFinal ? variableConstFinal + " " : ""}${variableType ? variableType + " " : ""}${variableName};\n`;

      // prettier-ignore
      constructorVariableSection += `\n\t\t${variableType.includes("?") ? "" : "required "}this.${variableName},`;
    }

    // Generate the class declaration and constructor snippet
    // prettier-ignore
    const classSnippet = `\
${textBeforeClass}\
class ${className} {${variableSection.length === 0 ? "" : "\n"}${variableSection}
\t${className}(${constructorVariableSection.length === 0 ? "" : "{"}${constructorVariableSection}${constructorVariableSection.length === 0 ? "" : "\n\t"}${constructorVariableSection.length === 0 ? "" : "}"});

\tfactory ${className}.fromJson(Map<String, dynamic> json) =>
\t\t\t_$${className}FromJson(json);
\tMap<String, dynamic> toJson() => _$${className}ToJson(this);
}
	`;

    // Create a new TextEdit to replace the entire document content
    overwriteDocument(document, classSnippet);
  }
}

function getVariableMatchesFromClass(text: string) {
  // Regular expression to match class variables
  const regex = /(late\s+)?(final\s+|const\s+)?([\w\d_?]+)\s+([\w\d_]+);/gm;

  // Match all class variables
  const matches = text.matchAll(regex);

  return matches;
}

function overwriteDocument(document: vscode.TextDocument, newString: string) {
  let edit = new vscode.WorkspaceEdit();
  const wholeDocument = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, wholeDocument, newString);

  // Apply the edit to the document
  vscode.workspace.applyEdit(edit);
}
