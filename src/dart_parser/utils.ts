export function toVarName(source: string): string {
  let s = source;
  let r = "";

  /**
   * @param {string} char
   */
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
