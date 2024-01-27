import * as vscode from "vscode";
import globalVal from "./globalVar";
const fs = require("fs");

export function toVarName(source: string): string {
  let s = source;
  let r = "";

  let replace = (char: string) => {
    if (s.includes(char)) {
      const splits = s.split(char);
      for (let i = 0; i < splits.length; i++) {
        let w = splits[i];
        i > 0 ? (r += capitalize(w)) : (r += w);
      }
    }
  };

  // Replace invalid variable characters like '-'.
  replace("-");
  replace("~");
  replace(":");
  replace("#");
  replace("$");

  if (r.length === 0) {
    r = s;
  }

  // Prevent dart keywords from being used.
  switch (r) {
    case "assert":
      r = "aAssert";
      break;
    case "break":
      r = "bBreak";
      break;
    case "case":
      r = "cCase";
      break;
    case "catch":
      r = "cCatch";
      break;
    case "class":
      r = "cClass";
      break;
    case "const":
      r = "cConst";
      break;
    case "continue":
      r = "cContinue";
      break;
    case "default":
      r = "dDefault";
      break;
    case "do":
      r = "dDo";
      break;
    case "else":
      r = "eElse";
      break;
    case "enum":
      r = "eEnum";
      break;
    case "extends":
      r = "eExtends";
      break;
    case "false":
      r = "fFalse";
      break;
    case "final":
      r = "fFinal";
      break;
    case "finally":
      r = "fFinally";
      break;
    case "for":
      r = "fFor";
      break;
    case "if":
      r = "iIf";
      break;
    case "in":
      r = "iIn";
      break;
    case "is":
      r = "iIs";
      break;
    case "new":
      r = "nNew";
      break;
    case "null":
      r = "nNull";
      break;
    case "rethrow":
      r = "rRethrow";
      break;
    case "return":
      r = "rReturn";
      break;
    case "super":
      r = "sSuper";
      break;
    case "switch":
      r = "sSwitch";
      break;
    case "this":
      r = "tThis";
      break;
    case "throw":
      r = "tThrow";
      break;
    case "true":
      r = "tTrue";
      break;
    case "try":
      r = "tTry";
      break;
    case "var":
      r = "vVar";
      break;
    case "void":
      r = "vVoid";
      break;
    case "while":
      r = "wWhile";
      break;
    case "with":
      r = "wWith";
      break;
  }

  if (r.length > 0 && r[0].match(new RegExp(/[0-9]/))) {
    r = "n" + r;
  }

  return r;
}

function capitalize(source: string) {
  let s = source;
  if (s.length > 0) {
    if (s.length > 1) {
      return s.substr(0, 1).toUpperCase() + s.substring(1, s.length);
    } else {
      return s.substr(0, 1).toUpperCase();
    }
  }

  return s;
}

export function removeEnd(source: string, end: string | any[]) {
  if (Array.isArray(end)) {
    let result = source.trim();
    for (let e of end) {
      result = removeEnd(result, e).trim();
    }
    return result;
  } else {
    const pos = source.length - end.length;
    return source.endsWith(end) ? source.substring(0, pos) : source;
  }
}

export function areStrictEqual(a: string, b: string) {
  let x = a.replace(/\s/g, "");
  let y = b.replace(/\s/g, "");
  return x === y;
}

export function isBlank(str: string) {
  return !str || /^\s*$/.test(str);
}

export function getEditor() {
  return vscode.window.activeTextEditor;
}

export function readSetting(key: string) {
  return vscode.workspace
    .getConfiguration()
    .get("dart_json_serializable_helper." + key);
}

export function count(source: string, match: string) {
  let count = 0;
  let length = match.length;
  for (let i = 0; i < source.length; i++) {
    let part = source.substr(i * length - 1, length);
    if (part === match) {
      count++;
    }
  }

  return count;
}

export function removeStart(source: string, start: string | any[]) {
  if (Array.isArray(start)) {
    let result = source.trim();
    for (let s of start) {
      result = removeStart(result, s).trim();
    }
    return result;
  } else {
    return source.startsWith(start)
      ? source.substring(start.length, source.length)
      : source;
  }
}

export function indent(source: string) {
  let r = "";
  for (let line of source.split("\n")) {
    r += "  " + line + "\n";
  }
  return r.length > 0 ? r : source;
}

export function includesOne(
  source: string,
  matches: string[],
  wordBased = true
) {
  const words = wordBased ? source.split(" ") : [source];
  for (let word of words) {
    for (let match of matches) {
      if (wordBased) {
        if (word === match) {
          return true;
        }
      } else {
        if (source.includes(match)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function includesAll(source: string, matches: string[]) {
  for (let match of matches) {
    if (!source.includes(match)) {
      return false;
    }
  }
  return true;
}

export async function findProjectName() {
  const pubspecs = await vscode.workspace.findFiles("pubspec.yaml");
  if (pubspecs !== null && pubspecs.length > 0) {
    const pubspec = pubspecs[0];
    const content = fs.readFileSync(pubspec.fsPath, "utf8");
    if (content !== null && content.includes("name: ")) {
      globalVal.isFlutter =
        content.includes("flutter:") && content.includes("sdk: flutter");
      for (const line of content.split("\n")) {
        if (line.startsWith("name: ")) {
          globalVal.projectName = line.replace("name:", "").trim();
          break;
        }
      }
    }
  }
}
