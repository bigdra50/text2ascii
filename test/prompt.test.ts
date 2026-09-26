import { describe, expect, test } from "bun:test";
import { retryPrompt, systemPrompt } from "../src/core/prompt.ts";

describe("systemPrompt", () => {
  test("絵の大きさの上限と、ASCII だけを使う規則と、返答の形を伝える", () => {
    const prompt = systemPrompt({ width: 72, height: 18 });
    expect(prompt).toContain("within 72 columns and 18 rows");
    expect(prompt).toContain("printable ASCII only (codes 32-126)");
    expect(prompt).toContain("single ```text code block");
  });

  test("テーマの雰囲気や比喩まで考えてから描くよう伝える", () => {
    expect(systemPrompt({ width: 60, height: 20 })).toContain("including its mood or any metaphor");
  });
});

describe("retryPrompt", () => {
  const prompt = retryPrompt("締切前夜", "abc\ndef", [
    { kind: "tooWide", width: 72, limit: 60 },
    { kind: "tooTall", height: 24, limit: 20 },
  ]);

  test("元のテーマを含める（claude -p は前の会話を覚えていないため）", () => {
    expect(prompt).toContain("Theme: 締切前夜");
  });

  test("違反をすべて列挙する", () => {
    expect(prompt).toContain("- The widest line has 72 columns; the limit is 60.");
    expect(prompt).toContain("- It has 24 rows; the limit is 20.");
  });

  test("前回の絵をコードブロックで添える", () => {
    expect(prompt).toContain("```text\nabc\ndef\n```");
  });
});
