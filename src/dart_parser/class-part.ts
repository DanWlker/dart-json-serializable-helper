import * as vscode from "vscode";

export class ClassPart {
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  current: string | null;
  replacement: string | null;

  constructor(
    name: string,
    startsAt = null,
    endsAt = null,
    current = null,
    replacement = null
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
      return null;
    }
    return new vscode.Position(this.startsAt, 0);
  }

  get endPos() {
    if (this.endsAt === null) {
      return null;
    }
    return new vscode.Position(this.endsAt, 0);
  }
}
