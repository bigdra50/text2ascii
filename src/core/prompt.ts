import type { Canvas, Violation } from "../contract/index.ts";
import { describeViolation } from "./art.ts";

// 2026-09-27 のモデル比較で使った文面。比較結果（既定のモデルと effort）はこの文面が前提なので、変えたら測り直す
export function systemPrompt(canvas: Canvas): string {
  return [
    "You are an ASCII artist inside a command-line tool.",
    "The user gives a theme in natural language (Japanese or English).",
    "Decide what to depict so the picture expresses the theme well, including its mood or any metaphor, then draw it.",
    "",
    "Rules:",
    "- Use printable ASCII only (codes 32-126). No Unicode, emoji, or full-width characters. Write any words in English or romaji.",
    `- Keep the art within ${canvas.width} columns and ${canvas.height} rows.`,
    "- Reply with the art in a single ```text code block and nothing else.",
  ].join("\n");
}

/** 描き直しの依頼文。claude -p は前の会話を持たないため、テーマと前回の絵も毎回添える */
export function retryPrompt(theme: string, previousArt: string, violations: readonly Violation[]): string {
  return [
    `Theme: ${theme}`,
    "",
    "Your previous drawing broke these rules:",
    ...violations.map((violation) => `- ${describeViolation(violation)}`),
    "",
    "Previous drawing:",
    "```text",
    previousArt,
    "```",
    "",
    "Draw it again so that it follows every rule.",
  ].join("\n");
}
