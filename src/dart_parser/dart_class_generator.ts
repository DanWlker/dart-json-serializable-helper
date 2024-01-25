import { ClassField } from "./class-field";
import { ClassPart } from "./class-part";
import { DartClass } from "./dart-class";
import { Imports } from "./imports";
import globalVal from "./globalVar";
import {
  areStrictEqual,
  count,
  includesAll,
  includesOne,
  indent,
  isBlank,
  readSetting,
  removeEnd,
} from "./utils";

export class DataClassGenerator {
  text: string;
  clazzes: DartClass[];
  fromJSON: boolean;
  part: string | null;
  imports: Imports;
  clazz: DartClass | null;

  constructor(text: string, clazzes = null, fromJSON = false, part = null) {
    this.text = text;
    this.fromJSON = fromJSON;
    this.clazzes = clazzes === null ? this.parseAndReadClasses() : clazzes;
    this.imports = new Imports(text);
    this.part = part;
    this.generateDataClazzes();
    this.clazz = null;
  }

  get hasImports() {
    return this.imports.hasImports;
  }

  requiresImport(imp: string, validOverrides: string[] = []) {
    this.imports.requiresImport(imp, validOverrides);
  }

  isPartSelected(part: string) {
    return this.part === null || this.part === part;
  }

  generateDataClazzes() {
    const insertConstructor =
      readSetting("constructor.enabled") && this.isPartSelected("constructor");

    for (let clazz of this.clazzes) {
      this.clazz = clazz;

      if (insertConstructor) {
        this.insertConstructor(clazz);
      }

      if (!clazz.isWidget) {
        if (!clazz.isAbstract) {
          if (
            readSetting("copyWith.enabled") &&
            this.isPartSelected("copyWith")
          ) {
            this.insertCopyWith(clazz);
          }
          if (
            readSetting("toMap.enabled") &&
            this.isPartSelected("serialization")
          ) {
            this.insertToMap(clazz);
          }
          if (
            readSetting("fromMap.enabled") &&
            this.isPartSelected("serialization")
          ) {
            this.insertFromMap(clazz);
          }
          if (
            readSetting("toJson.enabled") &&
            this.isPartSelected("serialization")
          ) {
            this.insertToJson(clazz);
          }
          if (
            readSetting("fromJson.enabled") &&
            this.isPartSelected("serialization")
          ) {
            this.insertFromJson(clazz);
          }
        }

        if (
          readSetting("toString.enabled") &&
          this.isPartSelected("toString")
        ) {
          this.insertToString(clazz);
        }

        if (
          (clazz.usesEquatable || readSetting("useEquatable")) &&
          this.isPartSelected("useEquatable")
        ) {
          this.insertEquatable(clazz);
        } else {
          if (
            readSetting("equality.enabled") &&
            this.isPartSelected("equality")
          ) {
            this.insertEquality(clazz);
          }
          if (
            readSetting("hashCode.enabled") &&
            this.isPartSelected("equality")
          ) {
            this.insertHash(clazz);
          }
        }
      }
    }
  }

  /**
   * @param {string} name
   * @param {string} finder
   * @param {DartClass} clazz
   */
  findPart(name: string, finder: string, clazz: DartClass) {
    const normalize = (src: string) => {
      let result = "";
      let generics = 0;
      let prevChar = "";
      for (const char of src) {
        if (char === "<") {
          generics++;
        }
        if (char !== " " && generics === 0) {
          result += char;
        }

        if (prevChar !== "=" && char === ">") {
          generics--;
        }
        prevChar = char;
      }

      return result;
    };

    const finderString = normalize(finder);
    const lines = clazz.classContent.split("\n");
    const part = new ClassPart(name);
    let curlies = 0;
    let singleLine = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const clazzStartsAtLine = clazz.startsAtLine;
      if (clazzStartsAtLine === null) {
        console.log("clazz.startsAtLine is null for DataClassGenerator");
        throw Error("clazz.startsAtLine is null for DataClassGenerator");
      }
      const lineNum = clazzStartsAtLine + i;

      curlies += count(line, "{");
      curlies -= count(line, "}");

      if (part.startsAt === null && normalize(line).startsWith(finderString)) {
        if (line.includes("=>")) {
          singleLine = true;
        }
        if (curlies === 2 || singleLine) {
          part.startsAt = lineNum;
          part.current = line + "\n";
        }
      } else if (
        part.startsAt !== null &&
        part.endsAt === null &&
        (curlies >= 2 || singleLine)
      ) {
        part.current += line + "\n";
      } else if (
        part.startsAt !== null &&
        part.endsAt === null &&
        curlies === 1
      ) {
        part.endsAt = lineNum;
        part.current += line;
      }

      // Detect the end of a single line function by searching for the ';' because
      // a single line function doesn't necessarily only have one single line.
      if (
        singleLine &&
        part.startsAt !== null &&
        part.endsAt === null &&
        line.trimRight().endsWith(";")
      ) {
        part.endsAt = lineNum;
      }
    }

    return part.isValid ? part : null;
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

  findOldConstrProperties(clazz: DartClass) {
    if (
      !clazz.hasConstructor ||
      clazz.constrStartsAtLine === clazz.constrEndsAtLine
    ) {
      return [];
    }

    let oldConstr = "";
    let brackets = 0;
    let didFindConstr = false;
    const clazzConstr = clazz.constr;
    if (clazzConstr === null) {
      console.log("clazzConstr is null for DartClassGenerator");
      throw Error("clazzConstr is null for DartClassGenerator");
    }
    for (let c of clazzConstr) {
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

  insertConstructor(clazz: DartClass) {
    const withDefaults = readSetting("constructor.default_values");

    let constr = "";
    let startBracket = "({";
    let endBracket = "})";

    if (clazz.constr !== null) {
      if (clazz.constr.trimLeft().startsWith("const")) {
        constr += "const ";
      }

      // Detect custom constructor brackets and preserve them.
      const fConstr = clazz.constr.replace("const", "").trimLeft();

      if (fConstr.startsWith(clazz.name + "([")) {
        startBracket = "([";
      } else if (fConstr.startsWith(clazz.name + "({")) {
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
        clazz.isWidget ||
        ((clazz.usesEquatable || readSetting("useEquatable")) &&
          this.isPartSelected("useEquatable"))
      ) {
        constr += "const ";
      }
    }

    constr += clazz.name + startBracket + "\n";

    // Add 'Key key,' for widgets in constructor.
    if (clazz.isWidget) {
      let hasKey = false;
      let clazzConstr = clazz.constr || "";
      for (let line of clazzConstr.split("\n")) {
        if (line.trim().startsWith("Key? key")) {
          hasKey = true;
          break;
        }
      }

      if (!hasKey) {
        constr += "  Key? key,\n";
      }
    }

    const oldProperties = this.findOldConstrProperties(clazz);
    for (let prop of oldProperties) {
      if (!prop.isThis) {
        constr += "  " + prop.text;
      }
    }

    for (let prop of clazz.properties) {
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
      constr += endBracket + (clazz.isWidget ? " : super(key: key);" : ";");
    };

    if (clazz.constr !== null) {
      let i = null;
      if (clazz.constr.includes(" : ")) {
        i = clazz.constr.indexOf(" : ") + 1;
      } else if (clazz.constr.trimRight().endsWith("{")) {
        i = clazz.constr.lastIndexOf("{");
      }

      if (i !== null) {
        let ending = clazz.constr.substring(i, clazz.constr.length);
        constr += `${endBracket} ${ending}`;
      } else {
        stdConstrEnd();
      }
    } else {
      stdConstrEnd();
    }

    if (clazz.hasConstructor) {
      const clazzConstr = clazz.constr;
      if (clazzConstr === null) {
        console.log("clazzConstr is null in DataClassGenerator");
        throw Error("clazzConstr is null in DataClassGenerator");
      }
      clazz.constrDifferent = !areStrictEqual(clazzConstr, constr);
      if (clazz.constrDifferent) {
        constr = removeEnd(indent(constr), "\n");

        this.replace(
          new ClassPart(
            "constructor",
            clazz.constrStartsAtLine,
            clazz.constrEndsAtLine,
            clazz.constr,
            constr
          ),
          clazz
        );
      }
    } else {
      clazz.constrDifferent = true;
      this.append(constr, clazz, true);
    }
  }

  insertCopyWith(clazz: DartClass) {
    let method = clazz.type + " copyWith({\n";
    for (const prop of clazz.properties) {
      method += `  ${prop.type}? ${prop.name},\n`;
    }
    method += "}) {\n";
    method += `  return ${clazz.type}(\n`;

    for (let p of clazz.properties) {
      method += `    ${clazz.hasNamedConstructor ? `${p.name}: ` : ""}${
        p.name
      } ?? this.${p.name},\n`;
    }

    method += "  );\n";
    method += "}";

    this.appendOrReplace("copyWith", method, `${clazz.name} copyWith(`, clazz);
  }

  insertToMap(clazz: DartClass) {
    let props = clazz.properties;

    function customTypeMapping(
      prop: ClassField,
      name: string | null = null,
      endFlag = ",\n"
    ) {
      prop = prop.isCollection ? prop.listType : prop;
      name = name === null ? prop.name : name;

      const nullSafe = prop.isNullable ? "?" : "";

      switch (prop.type) {
        case "DateTime":
          return `${name}${nullSafe}.millisecondsSinceEpoch${endFlag}`;
        case "Color":
          return `${name}${nullSafe}.value${endFlag}`;
        case "IconData":
          return `${name}${nullSafe}.codePoint${endFlag}`;
        default:
          return `${name}${
            !prop.isPrimitive ? `${nullSafe}.toMap()` : ""
          }${endFlag}`;
      }
    }

    let method = `Map<String, dynamic> toMap() {\n`;
    method += "  return <String, dynamic>{\n";
    for (let p of props) {
      method += `    '${p.jsonName}': `;

      if (p.isEnum) {
        if (p.isCollection) {
          method += `${p.name}.map((x) => x.index).toList(),\n`;
        } else {
          method += `${p.name}.index,\n`;
        }
      } else if (p.isCollection) {
        if (p.isMap || p.listType.isPrimitive) {
          const mapFlag = p.isSet
            ? (p.isNullable ? "?" : "") + ".toList()"
            : "";
          method += `${p.name}${mapFlag},\n`;
        } else {
          method += `${p.name}.map((x) => ${customTypeMapping(
            p,
            "x",
            ""
          )}).toList(),\n`;
        }
      } else {
        method += customTypeMapping(p);
      }
      if (p.name === props[props.length - 1].name) {
        method += "  };\n";
      }
    }
    method += "}";

    this.appendOrReplace(
      "toMap",
      method,
      "Map<String, dynamic> toMap()",
      clazz
    );
  }

  insertFromMap(clazz: DartClass) {
    let withDefaultValues = readSetting("fromMap.default_values");
    const leftOfValue = withDefaultValues ? "(" : "";
    const rightOfValue = withDefaultValues ? ")" : "";
    let props = clazz.properties;
    const fromJSON = this.fromJSON;

    function customTypeMapping(prop: ClassField, value: string | null = null) {
      const materialConvertValue = prop.isCollection ? "" : " as int";
      prop = prop.isCollection ? prop.listType : prop;
      const isAddDefault =
        withDefaultValues &&
        prop.rawType !== "dynamic" &&
        !prop.isNullable &&
        prop.isPrimitive;
      const addLeftDefault = isAddDefault ? leftOfValue : "";
      const addRightDefault = isAddDefault ? rightOfValue : "";
      value =
        value === null
          ? `${addLeftDefault}map['` + prop.jsonName + "']"
          : value;

      switch (prop.type) {
        case "DateTime":
          value = withDefaultValues
            ? `${leftOfValue}${value}??0${rightOfValue}`
            : value;
          return `DateTime.fromMillisecondsSinceEpoch(${value}${materialConvertValue})`;
        case "Color":
          value = withDefaultValues
            ? `${leftOfValue}${value}??0${rightOfValue}`
            : value;
          return `Color(${value}${materialConvertValue})`;
        case "IconData":
          value = withDefaultValues
            ? `${leftOfValue}${value}??0${rightOfValue}`
            : value;
          return `IconData(${value}${materialConvertValue}, fontFamily: 'MaterialIcons')`;
        default:
          return `${!prop.isPrimitive ? prop.type + ".fromMap(" : ""}${value}${
            !prop.isPrimitive ? " as Map<String,dynamic>)" : ""
          }${
            fromJSON
              ? prop.isDouble
                ? ".toDouble()"
                : prop.isInt
                ? ".toInt()"
                : ""
              : ""
          }${isAddDefault ? ` ?? ${prop.defValue}${addRightDefault}` : ""}`;
      }
    }

    let method = `factory ${clazz.name}.fromMap(Map<String, dynamic> map) {\n`;
    method += "  return " + clazz.type + "(\n";

    for (let p of props) {
      method += `    ${clazz.hasNamedConstructor ? `${p.name}: ` : ""}`;

      const value = `map['${p.jsonName}']`;

      // Add nullable check before serialization
      if (p.isNullable) {
        method += value + " != null ? ";
      }

      // serialization
      if (p.isEnum) {
        // List<E>
        if (p.isCollection) {
          const defaultValue = withDefaultValues ? " ?? <int>[]" : "";
          method += `${p.type}.from((${leftOfValue}${value}${defaultValue}${rightOfValue} as List<int>).map<${p.listType.rawType}>((x) => ${p.listType.rawType}.values[x]),)`;
        } else {
          const defaultValue = withDefaultValues ? " ?? 0" : "";
          method += `${p.rawType}.values[${leftOfValue}${value}${defaultValue}${rightOfValue} as int]`;
        }
      } else if (p.isCollection) {
        const defaultValue =
          withDefaultValues && !p.isNullable && p.isPrimitive
            ? ` ?? const <${p.listType.rawType}>${p.isList ? "[]" : "{}"})`
            : "";

        method += `${p.type}.from(`;
        /// List<String>.from(map['allowed'] ?? const <String>[] as List<String>),
        if (p.isPrimitive) {
          method += `(${value}${defaultValue} as ${p.type})`;
        } else {
          method += `(${value} as List<int>).map<${
            p.listType.rawType
          }>((x) => ${customTypeMapping(p, "x")},),${defaultValue})`;
        }
        /// (map['name'] ?? '') as String
      } else {
        if (p.isPrimitive) {
          method += customTypeMapping(p) + ` as ${p.type}`;
        } else {
          method += customTypeMapping(p);
        }
      }

      // end nullable check if field is nullable
      if (p.isNullable) {
        method += " : null";
      }

      method += `,\n`;

      const isLast = p.name === props[props.length - 1].name;
      if (isLast) {
        method += "  );\n";
      }
    }
    method += "}";

    this.appendOrReplace(
      "fromMap",
      method,
      `factory ${clazz.name}.fromMap(Map<String, dynamic> map)`,
      clazz
    );
  }

  insertToJson(clazz: DartClass) {
    this.requiresImport("dart:convert");

    const method = "String toJson() => json.encode(toMap());";
    this.appendOrReplace("toJson", method, "String toJson()", clazz);
  }

  insertFromJson(clazz: DartClass) {
    this.requiresImport("dart:convert");

    const method = `factory ${clazz.name}.fromJson(String source) => ${clazz.name}.fromMap(json.decode(source) as Map<String, dynamic>);`;
    this.appendOrReplace(
      "fromJson",
      method,
      `factory ${clazz.name}.fromJson(String source)`,
      clazz
    );
  }

  insertToString(clazz: DartClass) {
    if (clazz.usesEquatable || readSetting("useEquatable")) {
      let stringify = "@override\n";
      stringify += "bool get stringify => true;";

      this.appendOrReplace("stringify", stringify, "bool get stringify", clazz);
    } else {
      const short = clazz.fewProps;
      const props = clazz.properties;
      let method = "@override\n";
      method += `String toString() ${!short ? "{\n" : "=>"}`;
      method += `${!short ? "  return" : ""} '` + `${clazz.name}(`;
      for (let p of props) {
        const name = p.name;
        const isFirst = name === props[0].name;
        const isLast = name === props[props.length - 1].name;

        if (!isFirst) {
          method += " ";
        }

        method += name + ": $" + name + ",";

        if (isLast) {
          method = removeEnd(method, ",");
          method += ")';" + (short ? "" : "\n");
        }
      }
      method += !short ? "}" : "";

      this.appendOrReplace("toString", method, "String toString()", clazz);
    }
  }

  insertEquality(clazz: DartClass) {
    const props = clazz.properties;
    const hasCollection = props.find((p) => p.isCollection) !== undefined;

    let collectionEqualityFn;
    if (hasCollection) {
      // Flutter already has collection equality functions
      // in the foundation package.
      if (globalVal.isFlutter) {
        this.requiresImport("package:flutter/foundation.dart");
      } else {
        this.requiresImport("package:collection/collection.dart");

        collectionEqualityFn = "collectionEquals";
        const isListOnly =
          props.find((p) => p.isCollection && !p.isList) === undefined;
        if (isListOnly) {
          collectionEqualityFn = "listEquals";
        }
        const isMapOnly =
          props.find((p) => p.isCollection && !p.isMap) === undefined;
        if (isMapOnly) {
          collectionEqualityFn = "mapEquals";
        }
        const isSetOnly =
          props.find((p) => p.isCollection && !p.isSet) === undefined;
        if (isSetOnly) {
          collectionEqualityFn = "setEquals";
        }
      }
    }

    let method = "@override\n";
    method += `bool operator ==(covariant ${clazz.type} other) {\n`;
    method += "  if (identical(this, other)) return true;\n";
    if (hasCollection && !globalVal.isFlutter) {
      method += `  final ${collectionEqualityFn} = const DeepCollectionEquality().equals;\n`;
    }
    method += "\n";
    method += "  return \n";
    for (let prop of props) {
      if (prop.isCollection) {
        if (globalVal.isFlutter) {
          collectionEqualityFn = prop.isSet
            ? "setEquals"
            : prop.isMap
            ? "mapEquals"
            : "listEquals";
        }
        method += `    ${collectionEqualityFn}(other.${prop.name}, ${prop.name})`;
      } else {
        method += `    other.${prop.name} == ${prop.name}`;
      }
      if (prop.name !== props[props.length - 1].name) {
        method += " &&\n";
      } else {
        method += ";\n";
      }
    }
    method += "}";

    this.appendOrReplace("equality", method, "bool operator ==", clazz);
  }

  insertHash(clazz: DartClass) {
    const useJenkins = readSetting("hashCode.use_jenkins");
    const short = !useJenkins && clazz.fewProps;
    const props = clazz.properties;
    let method = "@override\n";
    method += `int get hashCode ${short ? "=>" : "{\n  return "}`;

    if (useJenkins) {
      // dart:ui import is required for Jenkins hash.
      this.requiresImport("dart:ui", [
        "package:flutter/material.dart",
        "package:flutter/cupertino.dart",
        "package:flutter/widgets.dart",
      ]);

      method += `hashList([\n`;
      for (let p of props) {
        method += "    " + p.name + `,\n`;
      }
      method += "  ]);";
    } else {
      for (let p of props) {
        const isFirst = p === props[0];
        method += `${isFirst && !short ? "" : short ? " " : "    "}${
          p.name
        }.hashCode`;
        if (p === props[props.length - 1]) {
          method += ";";
        } else {
          method += ` ^${!short ? "\n" : ""}`;
        }
      }
    }

    if (!short) {
      method += "\n}";
    }

    this.appendOrReplace("hashCode", method, "int get hashCode", clazz);
  }

  addEquatableDetails(clazz: DartClass) {
    // Do not generate Equatable for class with 'Base' in their
    // names as Base classes should inherit from Equatable.
    // see: https://github.com/BendixMa/Dart-Data-Class-Generator/issues/8
    if (clazz.superclass !== null && clazz.superclass.includes("Base")) {
      return;
    }

    this.requiresImport("package:equatable/equatable.dart");

    if (!clazz.usesEquatable) {
      if (clazz.superclass !== null || readSetting("useEquatableMixin")) {
        this.addMixin("EquatableMixin");
      } else {
        this.setSuperClass("Equatable");
      }
    }
  }

  insertEquatable(clazz: DartClass) {
    this.addEquatableDetails(clazz);

    const props = clazz.properties;
    const short = props.length <= 4;
    const split = short ? ", " : ",\n";
    let method = "@override\n";
    method += `List<Object> get props ${!short ? "{\n" : "=>"}`;
    method += `${!short ? "  return" : ""} ` + "[" + (!short ? "\n" : "");
    for (let prop of props) {
      const isLast = prop.name === props[props.length - 1].name;
      const inset = !short ? "    " : "";
      method += inset + prop.name + split;

      if (isLast) {
        if (short) {
          method = removeEnd(method, split);
        }
        method += (!short ? "  " : "") + "];" + (!short ? "\n" : "");
      }
    }
    method += !short ? "}" : "";

    this.appendOrReplace("props", method, "List<Object> get props", clazz);
  }

  addMixin(mixin: string) {
    if (this.clazz === null) {
      console.log("this.clazz is null in DartClassGenerator");
      throw Error("this.clazz is null in DartClassGenerator");
    }
    const mixins = this.clazz.mixins;
    if (!mixins.includes(mixin)) {
      mixins.push(mixin);
    }
  }

  addInterface(impl: string) {
    if (this.clazz === null) {
      console.log("this.clazz is null in DartClassGenerator");
      throw Error("this.clazz is null in DartClassGenerator");
    }
    const interfaces = this.clazz.interfaces;
    if (!interfaces.includes(impl)) {
      interfaces.push(impl);
    }
  }

  setSuperClass(clazz: string) {
    if (this.clazz === null) {
      console.log("this.clazz is null in DartClassGenerator");
      throw Error("this.clazz is null in DartClassGenerator");
    }
    this.clazz.superclass = clazz;
  }

  appendOrReplace(name: string, n: string, finder: string, clazz: DartClass) {
    let part = this.findPart(name, finder, clazz);
    let replacement = removeEnd(indent(n.replace("@override\n", "")), "\n");

    if (part !== null) {
      part.replacement = replacement;
      if (part.current === null) {
        console.log("part.current is null in DartClassGenerator");
        throw Error("part.current is null in DartClassGenerator");
      }
      if (!areStrictEqual(part.current, part.replacement)) {
        this.replace(part, clazz);
      }
    } else {
      this.append(n, clazz);
    }
  }

  append(method: string, clazz: DartClass, constr = false) {
    let met = indent(method);
    constr ? (clazz.constr = met) : (clazz.toInsert += "\n" + met);
  }

  replace(part: ClassPart, clazz: DartClass) {
    clazz.toReplace.push(part);
  }

  parseAndReadClasses() {
    let clazzes = [];
    let clazz = new DartClass();

    let lines = this.text.split("\n");
    let curlyBrackets = 0;
    let brackets = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const linePos = i + 1;
      // Make sure to look for 'class ' with the space in order to allow
      // fields that contain the word 'class' as in classifire.
      // issue: https://github.com/BendixMa/Dart-Data-Class-Generator/issues/2
      const classLine =
        line.trimLeft().startsWith("class ") ||
        line.trimLeft().startsWith("abstract class ");

      if (classLine) {
        clazz = new DartClass();
        clazz.startsAtLine = linePos;

        let classNext = false;
        let extendsNext = false;
        let implementsNext = false;
        let mixinsNext = false;

        // Reset brackets count when a new class was detected.
        curlyBrackets = 0;
        brackets = 0;

        const words = this.splitWhileMaintaingGenerics(line);
        for (let word of words) {
          word = word.trim();
          if (word.length > 0) {
            if (word === "class") {
              classNext = true;
            } else if (word === "extends") {
              extendsNext = true;
            } else if (extendsNext) {
              extendsNext = false;
              clazz.superclass = word;
            } else if (word === "with") {
              mixinsNext = true;
              extendsNext = false;
              implementsNext = false;
            } else if (word === "implements") {
              mixinsNext = false;
              extendsNext = false;
              implementsNext = true;
            } else if (classNext) {
              classNext = false;

              // Remove generics from class name.
              if (word.includes("<")) {
                clazz.fullGenericType = word.substring(
                  word.indexOf("<"),
                  word.lastIndexOf(">") + 1
                );

                word = word.substring(0, word.indexOf("<"));
              }

              clazz.name = word;
            } else if (mixinsNext) {
              const mixin = removeEnd(word, ",").trim();

              if (mixin.length > 0) {
                clazz.mixins.push(mixin);
              }
            } else if (implementsNext) {
              const impl = removeEnd(word, ",").trim();

              if (impl.length > 0) {
                clazz.interfaces.push(impl);
              }
            }
          }
        }

        // Do not add State<T> classes of widgets.
        if (!clazz.isState) {
          clazzes.push(clazz);
        }
      }

      if (clazz.classDetected) {
        // Check if class ended based on bracket count. If all '{' have a '}' pair,
        // class can be closed.
        curlyBrackets += count(line, "{");
        curlyBrackets -= count(line, "}");
        // Count brackets, e.g. to find the constructor.
        brackets += count(line, "(");
        brackets -= count(line, ")");

        // Detect beginning of constructor by looking for the class name and a bracket, while also
        // making sure not to falsely detect a function constructor invocation with the actual
        // constructor with boilerplaty checking all possible constructor options.
        const includesConstr = line
          .replace("const", "")
          .trimLeft()
          .startsWith(clazz.name + "(");
        if (includesConstr && !classLine) {
          clazz.constrStartsAtLine = linePos;
        }

        if (
          clazz.constrStartsAtLine !== null &&
          clazz.constrEndsAtLine === null
        ) {
          clazz.constr =
            clazz.constr === null ? line + "\n" : clazz.constr + line + "\n";

          // Detect end of constructor.
          if (brackets === 0) {
            clazz.constrEndsAtLine = linePos;
            clazz.constr = removeEnd(clazz.constr, "\n");
          }
        }

        clazz.classContent += line;
        // Detect end of class.
        if (curlyBrackets !== 0) {
          clazz.classContent += "\n";
        } else {
          clazz.endsAtLine = linePos;
          clazz = new DartClass();
        }

        if (brackets === 0 && curlyBrackets === 1) {
          if (clazz.name === null) {
            console.log("clazz.name is null in DataClassGenerator");
            throw Error("clazz.name is null in DataClassGenerator");
          }
          // Check if a line is valid to only include real properties.
          const lineValid =
            // Line shouldn't start with the class name as this would
            // be the constructor or an error.
            !line.trimLeft().startsWith(clazz.name) &&
            // Ignore comments.
            !line.trimLeft().startsWith("//") &&
            // These symbols would indicate that this is not a field.
            !includesOne(line, ["{", "}", "=>", "@"], false) &&
            // Filter out some keywords.
            !includesOne(line, ["static", "set", "get", "return", "factory"]) &&
            // Do not include final values that are assigned a value.
            !includesAll(line, ["final ", "="]) &&
            // Do not inlcude non final fields that were declared after the constructor.
            (clazz.constrStartsAtLine === null || line.includes("final ")) &&
            // Make sure not to catch abstract functions.
            !line.replace(/\s/g, "").endsWith(");");

          if (lineValid) {
            let type = null;
            let name = null;
            let isFinal = false;
            let isConst = false;

            const words = line.trim().split(" ");
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              const isLast = i === words.length - 1;

              if (word.length > 0 && word !== "}" && word !== "{") {
                if (word === "final") {
                  isFinal = true;
                } else if (i === 0 && word === "const") {
                  isConst = true;
                }

                // Be sure to not include keywords.
                if (word !== "final" && word !== "const") {
                  // If word ends with semicolon => variable name, else type.
                  let isVariable =
                    word.endsWith(";") || (!isLast && words[i + 1] === "=");
                  // Make sure we don't capture abstract functions like: String func();
                  isVariable = isVariable && !includesOne(word, ["(", ")"]);
                  if (isVariable) {
                    if (name === null) {
                      name = removeEnd(word, ";");
                    }
                  } else {
                    if (type === null) {
                      type = word;
                    }
                    // Types can have gaps => Pair<A, B>,
                    // thus append word to type if a name hasn't
                    // been detected.
                    else if (name === null) {
                      type += " " + word;
                    }
                  }
                }
              }
            }

            if (type !== null && name !== null) {
              const prop = new ClassField(
                type,
                name,
                linePos,
                isFinal,
                isConst
              );

              if (i > 0) {
                const prevLine = lines[i - 1];
                prop.isEnum = prevLine.match(/.*\/\/(\s*)enum/) !== null;
              }

              clazz.properties.push(prop);
            }
          }
        }
      }
    }

    return clazzes;
  }

  /**
   * This function is for parsing the class name line while maintaining
   * also more complex generic types like class A<A, List<C>>.
   *
   * @param {string} line
   */
  splitWhileMaintaingGenerics(line: string) {
    let words: string[] = [];
    let index = 0;
    let generics = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const isCurly = char === "{";
      const isSpace = char === " ";

      if (char === "<") {
        generics++;
      }
      if (char === ">") {
        generics--;
      }

      if (generics === 0 && (isSpace || isCurly)) {
        const word = line.substring(index, i).trim();

        // Do not add whitespace.
        if (word.length === 0) {
          continue;
        }
        const isOnlyGeneric = word.startsWith("<");

        // Append the generic type to the word when there is spacing
        // between them. E.g.: class Hello <A, B>
        if (isOnlyGeneric) {
          words[words.length - 1] = words[words.length - 1] + word;
        } else {
          words.push(word);
        }

        if (isCurly) {
          break;
        }

        index = i;
      }
    }

    return words;
  }
}
function removeStart(oldConstr: string, arg1: string[]): string {
  throw new Error("Function not implemented.");
}
