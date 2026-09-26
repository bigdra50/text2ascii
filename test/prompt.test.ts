import { describe, expect, test } from "bun:test";
import { retryPrompt, systemPrompt } from "../src/core/prompt.ts";

describe("systemPrompt", () => {
  test("states the size limits, the ASCII-only rule, and the reply format", () => {
    const prompt = systemPrompt({ width: 72, height: 18 });
    expect(prompt).toContain("within 72 columns and 18 rows");
    expect(prompt).toContain("printable ASCII only (codes 32-126)");
    expect(prompt).toContain("single ```text code block");
  });

  test("asks the model to think about the mood and metaphors of the theme before drawing", () => {
    expect(systemPrompt({ width: 60, height: 20 })).toContain("including its mood or any metaphor");
  });
});

describe("retryPrompt", () => {
  const prompt = retryPrompt("締切前夜", "abc\ndef", [
    { kind: "tooWide", width: 72, limit: 60 },
    { kind: "tooTall", height: 24, limit: 20 },
  ]);

  test("includes the original theme (claude -p does not remember earlier turns)", () => {
    expect(prompt).toContain("Theme: 締切前夜");
  });

  test("lists every violation", () => {
    expect(prompt).toContain("- The widest line has 72 columns; the limit is 60.");
    expect(prompt).toContain("- It has 24 rows; the limit is 20.");
  });

  test("attaches the previous art in a code block", () => {
    expect(prompt).toContain("```text\nabc\ndef\n```");
  });
});
