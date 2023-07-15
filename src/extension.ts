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
