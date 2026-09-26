import type { Canvas, Violation } from "../contract/index.ts";

// Also takes everything up to the end as art when the closing ``` is missing (a truncated reply)
const FENCE = /```[^\n]*\n([\s\S]*?)(?:```|$)/;

/** Extracts the art from a reply. Without a code block, the whole reply is treated as the art */
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
  // Width counts code points. The two-column display width of full-width characters is ignored because invalidChars rejects them anyway
  const width = Math.max(...lines.map((line) => [...line].length));
  const invalid = [...new Set([...lines.join("")].filter((char) => !isPrintableAscii(char)))];
  const found: readonly (Violation | null)[] = [
    width > canvas.width ? { kind: "tooWide", width, limit: canvas.width } : null,
    lines.length > canvas.height ? { kind: "tooTall", height: lines.length, limit: canvas.height } : null,
    invalid.length > 0 ? { kind: "invalidChars", chars: invalid } : null,
  ];
  return found.filter((violation) => violation !== null);
}

/** Describes a violation in English for the model, for use in redraw requests */
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
