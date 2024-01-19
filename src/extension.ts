import * as vscode from "vscode";
import * as path from "path";
import { findProjectName } from "./dart_parser/utils";
import { DataClassGenerator } from "./dart_parser/dart_class_generator";

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
        quickFixJsonSerializable(document, range);
      }
    )
  );

  findProjectName();
}

class QuickFixJsonSerializableProvider implements vscode.CodeActionProvider {
  private isCursorOnClass(
    document: vscode.TextDocument,
    range: vscode.Range
  ): boolean {
    const generator = new DataClassGenerator(document.getText());
    for (let clazz of generator.clazzes) {
      if (clazz.startsAtLine === null || clazz.endsAtLine === null) {
        continue;
      }
      const lineNumber = range.start.line + 1;
      return lineNumber === clazz.startsAtLine;
    }
    return false;
  }
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const codeActions: vscode.CodeAction[] = [];

    // Check if the cursor position is on a Dart class
    if (this.isCursorOnClass(document, range)) {
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

function quickFixJsonSerializable(
  document: vscode.TextDocument,
  range: vscode.Range
) {
  const edit = new vscode.WorkspaceEdit();

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
    overwriteDocument(document, edit, classSnippet);
  }
}

function getVariableMatchesFromClass(text: string) {
  // Regular expression to match class variables
  const regex = /(late\s+)?(final\s+|const\s+)?([\w\d_?]+)\s+([\w\d_]+);/gm;

  // Match all class variables
  const matches = text.matchAll(regex);

  return matches;
}

function overwriteDocument(
  document: vscode.TextDocument,
  edit: vscode.WorkspaceEdit,
  newString: string
) {
  const wholeDocument = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, wholeDocument, newString);

  // Apply the edit to the document
  vscode.workspace.applyEdit(edit);
}
