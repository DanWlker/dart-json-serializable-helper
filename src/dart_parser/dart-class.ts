import { ClassField } from "./class-field";
import { ClassPart } from "./class-part";
import {
  areStrictEqual,
  indent,
  isBlank,
  readSetting,
  removeEnd,
  removeStart,
} from "./utils";

export class DartClass {
  name: string | null;
  fullGenericType: string;
  superclass: string | null;
  interfaces: string[];
  mixins: string[];
  constr: string | null;
  properties: ClassField[];
  propertiesStringList: String[];
  startsAtLine: number | null;
  endsAtLine: number | null;
  constrStartsAtLine: number | null;
  constrEndsAtLine: number | null;
  constrDifferent: boolean;
  isArray: boolean;
  classContent: string;
  toInsert: string;
  toReplace: ClassPart[];
  isLastInFile: boolean;

  constructor() {
    this.name = null;
    this.fullGenericType = "";
    this.superclass = null;
    this.interfaces = [];
    this.mixins = [];
    this.constr = null;
    this.properties = [];
    this.propertiesStringList = [];
    this.startsAtLine = null;
    this.endsAtLine = null;
    this.constrStartsAtLine = null;
    this.constrEndsAtLine = null;
    this.constrDifferent = false;
    this.isArray = false;
    this.classContent = "";
    this.toInsert = "";
    this.toReplace = [];
    this.isLastInFile = false;
  }

  get type() {
    return this.name + this.genericType;
  }

  get genericType() {
    const parts = this.fullGenericType.split(",");
    return parts
      .map((type) => {
        let part = type.trim();
        if (part.includes("extends")) {
          part = part.substring(0, part.indexOf("extends")).trim();
          if (type === parts[parts.length - 1]) {
            part += ">";
          }
        }

        return part;
      })
      .join(", ");
  }

  get propsEndAtLine() {
    if (this.properties.length > 0) {
      return this.properties[this.properties.length - 1].line;
    } else {
      return -1;
    }
  }

  get classDetected() {
    return this.startsAtLine !== null;
  }

  get didChange() {
    return (
      this.toInsert.length > 0 ||
      this.toReplace.length > 0 ||
      this.constrDifferent
    );
  }

  get hasNamedConstructor() {
    if (this.constr !== null) {
      return this.constr
        .replace("const", "")
        .trimLeft()
        .startsWith(this.name + "({");
    }

    return true;
  }

  get hasConstructor() {
    return (
      this.constrStartsAtLine !== null &&
      this.constrEndsAtLine !== null &&
      this.constr !== null
    );
  }

  get hasMixins() {
    return this.mixins !== null && this.mixins.length > 0;
  }

  get hasInterfaces() {
    return this.interfaces !== null && this.interfaces.length > 0;
  }

  get hasEnding() {
    return this.endsAtLine !== null;
  }

  get hasProperties() {
    return this.properties.length > 0;
  }

  get fewProps() {
    return this.properties.length <= 3;
  }

  get isValid() {
    return (
      this.classDetected &&
      this.hasEnding &&
      this.hasProperties &&
      this.uniquePropNames
    );
  }

  get isWidget() {
    return (
      this.superclass !== null &&
      (this.superclass === "StatelessWidget" ||
        this.superclass === "StatefulWidget")
    );
  }

  get isStatelessWidget() {
    return (
      this.isWidget &&
      this.superclass !== null &&
      this.superclass === "StatelessWidget"
    );
  }

  get isState() {
    return (
      !this.isWidget &&
      this.superclass !== null &&
      this.superclass.startsWith("State<")
    );
  }

  get isAbstract() {
    return this.classContent.trimLeft().startsWith("abstract class");
  }

  get usesEquatable() {
    return (
      (this.superclass !== null && this.superclass === "Equatable") ||
      (this.hasMixins && this.mixins.includes("EquatableMixin"))
    );
  }

  get issue() {
    const def = this.name + " couldn't be converted to a data class: ";
    let msg = def;
    if (!this.hasProperties) {
      msg += "Class must have at least one property!";
    } else if (!this.hasEnding) {
      msg += "Class has no ending!";
    } else if (!this.uniquePropNames) {
      msg += "Class doesn't have unique property names!";
    } else {
      msg = removeEnd(msg, ": ") + ".";
    }

    return msg;
  }

  get uniquePropNames() {
    let props: string[] = [];
    for (let p of this.properties) {
      const n = p.name;
      if (props.includes(n)) {
        return false;
      }
      props.push(n);
    }
    return true;
  }

  replacementAtLine(line: number) {
    for (let part of this.toReplace) {
      if (part.startsAt === null || part.endsAt === null) {
        console.log(
          `startsAt: ${part.startsAt}, endsAt: ${part.endsAt} for DartClass`
        );
        continue;
      }
      if (part.startsAt <= line && part.endsAt >= line) {
        return part.replacement;
      }
    }

    return null;
  }

  getClassNameLine() {
    const classType = this.isAbstract ? "abstract class" : "class";
    let classDeclaration = classType + " " + this.name + this.fullGenericType;
    if (this.superclass !== null) {
      classDeclaration += " extends " + this.superclass;
    }

    function addSuperTypes(list: string[], keyword: string) {
      if (list.length === 0) {
        return;
      }

      const length = list.length;
      classDeclaration += ` ${keyword} `;
      for (let x = 0; x < length; x++) {
        const isLast = x === length - 1;
        const type = list[x];
        classDeclaration += type;

        if (!isLast) {
          classDeclaration += ", ";
        }
      }
    }

    addSuperTypes(this.mixins, "with");
    addSuperTypes(this.interfaces, "implements");

    classDeclaration += " {\n";
    return classDeclaration;
  }

  generateClassReplacement() {
    let replacement = "";
    let lines = this.classContent.split("\n");

    if (this.endsAtLine === null || this.startsAtLine === null) {
      console.log(
        `startsAtLine: ${this.startsAtLine}, endsAtLine ${this.endsAtLine} for DartClass`
      );
      throw Error(
        `startsAtLine: ${this.startsAtLine}, endsAtLine ${this.endsAtLine} for DartClass`
      );
    }

    for (let i = this.endsAtLine - this.startsAtLine; i >= 0; i--) {
      let line = lines[i] + "\n";
      let l = this.startsAtLine + i;

      if (i === 0) {
        let classDeclaration = this.getClassNameLine();
        replacement = classDeclaration + replacement;
      } else if (
        l === this.propsEndAtLine &&
        this.constr !== null &&
        !this.hasConstructor
      ) {
        replacement = this.constr + replacement;
        replacement = line + replacement;
      } else if (l === this.endsAtLine && this.isValid) {
        replacement = line + replacement;
        replacement = this.toInsert + replacement;
      } else {
        let rp = this.replacementAtLine(l);
        if (rp !== null) {
          if (!replacement.includes(rp)) {
            replacement = rp + "\n" + replacement;
          }
        } else {
          replacement = line + replacement;
        }
      }
    }

    return removeEnd(replacement, "\n");
  }

  getConstructor() {
    if (this.constr !== null) {
      return this.constr;
    }

    return this.generateConstructor();
  }

  generateConstructor() {
    const withDefaults = readSetting("constructor.default_values");

    let constr = "";
    let startBracket = "({";
    let endBracket = "})";

    if (this.constr !== null) {
      if (this.constr.trimLeft().startsWith("const")) {
        constr += "const ";
      }

      // Detect custom constructor brackets and preserve them.
      const fConstr = this.constr.replace("const", "").trimLeft();

      if (fConstr.startsWith(this.name + "([")) {
        startBracket = "([";
      } else if (fConstr.startsWith(this.name + "({")) {
        startBracket = "({";
      } else {
        startBracket = "(";
      }

      if (fConstr.includes("])")) {
        endBracket = "])";
      } else if (fConstr.includes("})")) {
        endBracket = "})";
      } else {
        endBracket = ")";
      }
    } else {
      if (
        this.isWidget
        // ||((this.usesEquatable || readSetting("useEquatable")) &&
        //   this.isPartSelected("useEquatable"))
      ) {
        constr += "const ";
      }
    }

    constr += this.name + startBracket + "\n";

    // Add 'Key key,' for widgets in constructor.
    if (this.isWidget) {
      let hasKey = false;
      let thisConstr = this.constr || "";
      for (let line of thisConstr.split("\n")) {
        if (line.trim().startsWith("Key? key")) {
          hasKey = true;
          break;
        }
      }

      if (!hasKey) {
        constr += "  Key? key,\n";
      }
    }

    const oldProperties = this.findOldConstrProperties();
    for (let prop of oldProperties) {
      if (!prop.isThis) {
        constr += "  " + prop.text;
      }
    }

    for (let prop of this.properties) {
      const oldProperty = this.findConstrParameter(prop, oldProperties);
      if (oldProperty !== null) {
        if (oldProperty.isThis) {
          constr += "  " + oldProperty.text;
        }

        continue;
      }

      const parameter = `this.${prop.name}`;

      constr += "  ";

      if (!prop.isNullable) {
        const hasDefault =
          withDefaults &&
          (prop.isPrimitive || prop.isCollection) &&
          prop.rawType !== "dynamic";
        const isNamedConstr = startBracket === "({" && endBracket === "})";

        if (hasDefault) {
          constr += `${parameter} = ${prop.defValue},\n`;
        } else if (isNamedConstr) {
          constr += `required ${parameter},\n`;
        } else {
          constr += `${parameter},\n`;
        }
      } else {
        constr += `${parameter},\n`;
      }
    }

    const stdConstrEnd = () => {
      constr += endBracket + (this.isWidget ? " : super(key: key);" : ";");
    };

    if (this.constr !== null) {
      let i = null;
      if (this.constr.includes(" : ")) {
        i = this.constr.indexOf(" : ") + 1;
      } else if (this.constr.trimRight().endsWith("{")) {
        i = this.constr.lastIndexOf("{");
      }

      if (i !== null) {
        let ending = this.constr.substring(i, this.constr.length);
        constr += `${endBracket} ${ending}`;
      } else {
        stdConstrEnd();
      }
    } else {
      stdConstrEnd();
    }

    this.constrDifferent = true;
    return constr;
  }

  findOldConstrProperties() {
    if (
      !this.hasConstructor ||
      this.constrStartsAtLine === this.constrEndsAtLine
    ) {
      return [];
    }

    let oldConstr = "";
    let brackets = 0;
    let didFindConstr = false;
    const thisConstr = this.constr;
    if (thisConstr === null) {
      console.log("thisConstr is null for DartClassGenerator");
      throw Error("thisConstr is null for DartClassGenerator");
    }
    for (let c of thisConstr) {
      if (c === "(") {
        if (didFindConstr) {
          oldConstr += c;
        }
        brackets++;
        didFindConstr = true;
        continue;
      } else if (c === ")") {
        brackets--;
        if (didFindConstr && brackets === 0) {
          break;
        }
      }

      if (brackets >= 1) {
        oldConstr += c;
      }
    }

    oldConstr = removeStart(oldConstr, ["{", "["]);
    oldConstr = removeEnd(oldConstr, ["}", "]"]);

    let oldArguments = oldConstr.split("\n");
    const oldProperties = [];
    for (let arg of oldArguments) {
      let formatted = arg.replace("required", "").trim();
      if (formatted.indexOf("=") !== -1) {
        formatted = formatted.substring(0, formatted.indexOf("=")).trim();
      }

      let name = null;
      let isThis = false;
      if (formatted.startsWith("this.")) {
        name = formatted.replace("this.", "");
        isThis = true;
      } else {
        const words = formatted.split(" ");
        if (words.length >= 1) {
          const w = words[1];
          if (!isBlank(w)) {
            name = w;
          }
        }
      }

      if (name !== null) {
        oldProperties.push({
          name: removeEnd(name.trim(), ","),
          text: arg.trim() + "\n",
          isThis: isThis,
        });
      }
    }

    return oldProperties;
  }

  /**
   * If class already exists and has a constructor with the parameter, reuse that parameter.
   * E.g. when the dev changed the parameter from this.x to this.x = y the generator inserts
   * this.x = y. This way the generator can preserve changes made in the constructor.
   */
  findConstrParameter(
    prop: ClassField | string,
    oldProps: { name: string; text: string; isThis: boolean }[]
  ) {
    const name = typeof prop === "string" ? prop : prop.name;
    for (let oldProp of oldProps) {
      if (name === oldProp.name) {
        return oldProp;
      }
    }

    return null;
  }
}
