import { ClassField } from "./class-field";
import { ClassPart } from "./class-part";
import { removeEnd } from "./utils";

export class DartClass {
  name: string | null;
  fullGenericType: string;
  superclass: string | null;
  interfaces: string[];
  mixins: string[];
  constr: string | null;
  properties: ClassField[];
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

  generateClassReplacement() {
    let replacement = "";
    let lines = this.classContent.split("\n");

    if (this.endsAtLine === null || this.startsAtLine === null) {
      throw Error(
        `startsAtLine: ${this.startsAtLine}, endsAtLine ${this.endsAtLine} for DartClass`
      );
    }

    for (let i = this.endsAtLine - this.startsAtLine; i >= 0; i--) {
      let line = lines[i] + "\n";
      let l = this.startsAtLine + i;

      if (i === 0) {
        const classType = this.isAbstract ? "abstract class" : "class";
        let classDeclaration =
          classType + " " + this.name + this.fullGenericType;
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
}
