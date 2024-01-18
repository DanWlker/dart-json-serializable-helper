import { removeEnd, toVarName } from "./utils";

export class ClassField {
  rawType: string;
  jsonName: string;
  name: string;
  line: number;
  isFinal: boolean;
  isConst: boolean;
  isEnum: boolean;
  isCollectionType: (type: string) => boolean;

  constructor(
    type: string,
    name: string,
    line = 1,
    isFinal = true,
    isConst = false
  ) {
    this.rawType = type;
    this.jsonName = name;
    this.name = toVarName(name);
    this.line = line;
    this.isFinal = isFinal;
    this.isConst = isConst;
    this.isEnum = false;
    this.isCollectionType = (type) =>
      this.rawType === type || (this?.rawType?.startsWith(type + "<") ?? false);
  }

  get type() {
    return this.isNullable ? removeEnd(this.rawType, "?") : this.rawType;
  }

  get isNullable() {
    return this.rawType.endsWith("?");
  }

  get isList() {
    return this.isCollectionType("List");
  }

  get isMap() {
    return this.isCollectionType("Map");
  }

  get isSet() {
    return this.isCollectionType("Set");
  }

  get isCollection() {
    return this.isList || this.isMap || this.isSet;
  }

  get listType(): ClassField {
    if (this.isList || this.isSet) {
      const collection = this.isSet ? "Set" : "List";
      const type =
        this.rawType === collection
          ? "dynamic"
          : this.rawType.replace(collection + "<", "").replace(">", "");
      return new ClassField(type, this.name, this.line, this.isFinal);
    }

    return this;
  }

  get isPrimitive() {
    let t = this.listType.type;
    return (
      t === "String" ||
      t === "num" ||
      t === "dynamic" ||
      t === "bool" ||
      this.isDouble ||
      this.isInt ||
      this.isMap
    );
  }

  get isPrivate() {
    return this.name.startsWith("_");
  }

  get defValue() {
    if (this.isList) {
      return "const []";
    } else if (this.isMap || this.isSet) {
      return "const {}";
    } else {
      switch (this.type) {
        case "String":
          return "''";
        case "num":
        case "int":
          return "0";
        case "double":
          return "0.0";
        case "bool":
          return "false";
        case "dynamic":
          return "null";
        default:
          return `${this.type}()`;
      }
    }
  }

  get isInt() {
    return this.listType.type === "int";
  }

  get isDouble() {
    return this.listType.type === "double";
  }
}
