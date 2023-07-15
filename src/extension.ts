import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as kill from "tree-kill";

let _channel: vscode.OutputChannel;
let _watchProcess: ChildProcess;

function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Flutter Helper Logs");
  }

  return _channel;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("dart-json-serializable-helper is now active!");

  // Code gen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dartJsonSerializableHelper.genModel",
      () => {
        // The code you place here will be executed every time your command is executed

        let process = spawn(
          "flutter",
          [
            "packages",
            "pub",
            "run",
            "build_runner",
            "build",
            "--delete-conflicting-outputs",
          ],
          {
            shell: true,
            cwd: vscode.workspace.rootPath, //TODO: replace this
            //   detached: true
          }
        );

        process.stdout.on("data", (data) => {
          console.log(`stdout: ${data}`);
          getOutputChannel().appendLine(data);
        });

        process.stderr.on("data", (data) => {
          console.error(`stderr: ${data}`);
          getOutputChannel().appendLine(data);
        });

        process.on("close", (code) => {
          console.log(`child process exited with code ${code}`);
          getOutputChannel().appendLine(
            `child process exited with code ${code}`
          );
        });
      }
    )
  );

  // Watch code gen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dartJsonSerializableHelper.genModelWatch",
      () => {
        if (_watchProcess && !_watchProcess.killed) {
          vscode.window.showInformationMessage("Stopped Codegen Process");
          if (_watchProcess.pid) {
            kill(_watchProcess.pid);
          }
          _watchProcess.kill();
        } else {
          vscode.window.showInformationMessage("Started Codegen Process");
          _watchProcess = spawn(
            "flutter",
            [
              "packages",
              "pub",
              "run",
              "build_runner",
              "watch",
              "--delete-conflicting-outputs",
            ],
            {
              shell: true,
              cwd: vscode.workspace.rootPath,
              //   detached: true
            }
          );

          _watchProcess.stdout?.on("data", (data) => {
            console.log(`stdout: ${data}`);
            getOutputChannel().appendLine(data);
          });

          _watchProcess.stderr?.on("data", (data) => {
            console.error(`stderr: ${data}`);
            getOutputChannel().appendLine(data);
          });

          _watchProcess.on("close", (code) => {
            console.log(`child process exited with code ${code}`);
            getOutputChannel().appendLine(
              `child process exited with code ${code}`
            );
          });
        }
      }
    )
  );

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
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (_watchProcess && !_watchProcess.killed) {
    if (_watchProcess.pid) {
      kill(_watchProcess.pid);
    }
    _watchProcess.kill();
  }
}

class QuickFixJsonSerializableProvider implements vscode.CodeActionProvider {
  private isCursorOnClass(
    document: vscode.TextDocument,
    range: vscode.Range
  ): boolean {
    // Get the text of the current line
    const lineText = document.lineAt(range.start.line).text;

    // Check if the line contains the class keyword
    return lineText.includes("class "); //with a space is intentional
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

  //   resolveCodeAction?(
  //     codeAction: vscode.CodeAction,
  //     token: vscode.CancellationToken
  //   ): vscode.ProviderResult<vscode.CodeAction> {
  //     throw new Error("Method not implemented.");
  //   }
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
  const filePaths = document.fileName.split("\\");
  const fileName = filePaths.at(-1);

  if (classRegex && fileName) {
    const className = classRegex[1];

    // Generate the class declaration and constructor snippet
    const classSnippet = `
	import 'package:json_annotation/json_annotation.dart';
	part '${fileName}.g.dart';
	
	class ${className} {
		${className}();

		factory ${className}.fromJson(Map<String, dynamic> json) => _${className}FromJson(json);
		Map<String, dynamic> toJson() => _$${className}ToJson(this);
	}
	`;

    // Create a new TextEdit to replace the entire document content
    overwriteDocument(document, edit, classSnippet);
  }
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
