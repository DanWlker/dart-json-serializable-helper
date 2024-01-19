import * as vscode from "vscode";

export class ClassPart {
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  current: string | null;
  replacement: string | null;

  constructor(
    name: string,
    startsAt: number | null = null,
    endsAt: number | null = null,
    current: string | null = null,
    replacement: string | null = null
  ) {
    this.name = name;
    this.startsAt = startsAt;
    this.endsAt = endsAt;
    this.current = current;
    this.replacement = replacement;
  }

  get isValid(): boolean {
    return (
      this.startsAt !== null && this.endsAt !== null && this.current !== null
    );
  }

  get startPos(): vscode.Position | null {
    if (this.startsAt === null) {
      throw new Error("startsAt is null for ClassPart");
    }
    return new vscode.Position(this.startsAt, 0);
  }

  get endPos() {
    if (this.endsAt === null) {
      throw new Error("endsAt is null for ClassPart");
    }
    return new vscode.Position(this.endsAt, 0);
  }
}
