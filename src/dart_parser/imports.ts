import { areStrictEqual, getEditor, isBlank, removeEnd } from "./utils";
import * as vscode from "vscode";
import globalVal from "./globalVar";
import path = require("path");

export class Imports {
  text: string;
  values: string[];
  startAtLine: number | null;
  endAtLine: number | null;
  rawImports: string | null;

  constructor(text: string) {
    this.values = [];
    this.startAtLine = null;
    this.endAtLine = null;
    this.rawImports = null;
    this.text = text;

    this.readImports();
  }

  get hasImports() {
    return this.values !== null && this.values.length > 0;
  }

  get hasExportDeclaration() {
    return /^export /m.test(this.formatted);
  }

  get hasImportDeclaration() {
    return /^import /m.test(this.formatted);
  }

  get hasPreviousImports() {
    return this.startAtLine !== null && this.endAtLine !== null;
  }

  get didChange() {
    if (this.rawImports === null) {
      console.log("rawImports is null for Imports");
      throw Error("rawImports is null for Imports");
    }

    return !areStrictEqual(this.rawImports, this.formatted);
  }

  get range() {
    if (this.startAtLine === null || this.endAtLine === null) {
      throw new Error(
        `startAtLine: ${this.startAtLine}, endAtLine: ${this.endAtLine} for Imports`
      );
    }

    return new vscode.Range(
      new vscode.Position(this.startAtLine - 1, 0),
      new vscode.Position(this.endAtLine, 1)
    );
  }

  readImports() {
    this.rawImports = "";
    const lines = this.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isLast = i === lines.length - 1;

      if (
        line.startsWith("import") ||
        line.startsWith("export") ||
        line.startsWith("part")
      ) {
        this.values.push(line);
        this.rawImports += `${line}\n`;
        if (this.startAtLine === null) {
          this.startAtLine = i + 1;
        }

        if (isLast) {
          this.endAtLine = i + 1;
          break;
        }
      } else {
        const isLicenseComment =
          line.startsWith("//") && this.values.length === 0;
        const didEnd = !(
          isBlank(line) ||
          line.startsWith("library") ||
          isLicenseComment
        );

        if (isLast || didEnd) {
          if (this.startAtLine !== null) {
            if (i > 0 && isBlank(lines[i - 1])) {
              this.endAtLine = i - 1;
            } else {
              this.endAtLine = i;
            }
          }
          break;
        }
      }
    }
  }

  get formatted() {
    if (!this.hasImports) {
      return "";
    }

    let workspace = globalVal.projectName;
    if (workspace === null || workspace.length === 0) {
      const file = getEditor()?.document.uri;
      if (file === undefined) {
        console.log("file is undefined in Imports");
        throw Error("file is undefined in Imports");
      }
      if (file.scheme === "file") {
        const folder = vscode.workspace.getWorkspaceFolder(file);
        if (folder) {
          workspace = path.basename(folder.uri.fsPath).replace("-", "_");
        }
      }
    }

    const dartImports = [];
    const packageImports = [];
    const packageLocalImports = [];
    const relativeImports = [];
    const partStatements = [];
    const exports = [];

    for (let imp of this.values) {
      if (imp.startsWith("export")) {
        exports.push(imp);
      } else if (imp.startsWith("part")) {
        partStatements.push(imp);
      } else if (imp.includes("dart:")) {
        dartImports.push(imp);
      } else if (workspace !== null && imp.includes(`package:${workspace}`)) {
        packageLocalImports.push(imp);
      } else if (imp.includes("package:")) {
        packageImports.push(imp);
      } else {
        relativeImports.push(imp);
      }
    }

    let imps = "";
    function addImports(imports: string[]) {
      imports.sort();
      for (let i = 0; i < imports.length; i++) {
        const isLast = i === imports.length - 1;
        const imp = imports[i];
        imps += imp + "\n";

        if (isLast) {
          imps += "\n";
        }
      }
    }

    addImports(dartImports);
    addImports(packageImports);
    addImports(packageLocalImports);
    addImports(relativeImports);
    addImports(exports);
    addImports(partStatements);

    return removeEnd(imps, "\n");
  }

  includes(imp: string) {
    return this.values.includes(imp);
  }

  push(imp: string) {
    return this.values.push(imp);
  }

  hastAtLeastOneImport(imps: string[]) {
    for (let imp of imps) {
      const impt = `import '${imp}';`;
      if (this.text.includes(impt) || this.includes(impt)) {
        return true;
      }
    }
    return false;
  }

  requiresImport(imp: string, validOverrides: string[] = []) {
    const formattedImport = !imp.startsWith("import")
      ? "import '" + imp + "';"
      : imp;

    if (
      !this.includes(formattedImport) &&
      !this.hastAtLeastOneImport(validOverrides)
    ) {
      this.values.push(formattedImport);
    }
  }
}
