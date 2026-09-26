import type { Canvas, Violation } from "../contract/index.ts";

// 閉じの ``` が無い返答（出力の打ち切り）でも、末尾までを絵として拾う
const FENCE = /```[^\n]*\n([\s\S]*?)(?:```|$)/;

/** 返答から絵の部分を取り出す。コードブロックが無ければ返答全体を絵として扱う */
export function extractArt(text: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  const body = FENCE.exec(normalized)?.[1] ?? normalized;
  const lines = body.split("\n").map((line) => line.trimEnd());
  const first = lines.findIndex((line) => line !== "");
  const last = lines.findLastIndex((line) => line !== "");
  return first === -1 ? "" : lines.slice(first, last + 1).join("\n");
}

const isPrintableAscii = (char: string) => char >= " " && char <= "~";

export function validateArt(art: string, canvas: Canvas): readonly Violation[] {
  if (art.trim() === "") return [{ kind: "empty" }];
  const lines = art.split("\n");
  // 幅はコードポイント数で数える。全角文字の表示幅（2 列）は、invalidChars として別に弾くので考えない
  const width = Math.max(...lines.map((line) => [...line].length));
  const invalid = [...new Set([...lines.join("")].filter((char) => !isPrintableAscii(char)))];
  const found: readonly (Violation | null)[] = [
    width > canvas.width ? { kind: "tooWide", width, limit: canvas.width } : null,
    lines.length > canvas.height ? { kind: "tooTall", height: lines.length, limit: canvas.height } : null,
    invalid.length > 0 ? { kind: "invalidChars", chars: invalid } : null,
  ];
  return found.filter((violation) => violation !== null);
}

/** 違反をモデル向けの英文で表す。描き直しの指示に使う */
export function describeViolation(violation: Violation): string {
  switch (violation.kind) {
    case "empty":
      return "The reply contained no drawing.";
    case "tooWide":
      return `The widest line has ${violation.width} columns; the limit is ${violation.limit}.`;
    case "tooTall":
      return `It has ${violation.height} rows; the limit is ${violation.limit}.`;
    case "invalidChars":
      return `It contains characters outside printable ASCII: ${violation.chars.map((c) => JSON.stringify(c)).join(", ")}.`;
  }
}
