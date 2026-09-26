import { describe, expect, test } from "bun:test";
import { explainFailure, explainViolation, formatAttempt } from "../src/cli/report.ts";
import { asModelId } from "../src/contract/index.ts";

describe("explainViolation", () => {
  test("違反を利用者向けの日本語で表す", () => {
    expect(explainViolation({ kind: "empty" })).toBe("絵が空だった");
    expect(explainViolation({ kind: "tooWide", width: 72, limit: 60 })).toBe("幅が 72 列ある（上限 60）");
    expect(explainViolation({ kind: "tooTall", height: 24, limit: 20 })).toBe("高さが 24 行ある（上限 20）");
    expect(explainViolation({ kind: "invalidChars", chars: ["猫", "\t"] })).toBe(
      'ASCII 以外の文字を含む（"猫"、"\\t"）',
    );
  });
});

describe("explainFailure", () => {
  test("バックエンドの失敗を利用者向けの日本語で表す", () => {
    expect(explainFailure({ kind: "processFailed", exitCode: 127, stderr: "command not found: claude" })).toBe(
      "claude -p が終了コード 127 で止まった: command not found: claude",
    );
    expect(explainFailure({ kind: "processFailed", exitCode: 1, stderr: "" })).toBe(
      "claude -p が終了コード 1 で止まった（標準エラーは空）",
    );
    expect(explainFailure({ kind: "reportedError", message: "API Error: 529 overloaded" })).toBe(
      "claude -p がエラーを返した: API Error: 529 overloaded",
    );
    expect(explainFailure({ kind: "refused" })).toBe("モデルがこのテーマの生成を断った");
    expect(explainFailure({ kind: "unreadableOutput", output: "x".repeat(300) })).toBe(
      `claude -p の出力を読めなかった: ${"x".repeat(200)}…`,
    );
  });
});

describe("formatAttempt", () => {
  const usage = {
    model: asModelId("claude-opus-5-5"),
    durationMs: 5949,
    costUsd: 0.01071,
    outputTokens: 420,
    thinkingTokens: 0,
  };

  test("試行の番号、モデル、秒数、定価換算の費用、thinking の量を並べる", () => {
    expect(formatAttempt({ art: "x", violations: [], usage }, 0)).toBe(
      "試行 1: claude-opus-5-5 / 5.9 秒 / $0.0107（定価換算） / thinking 0 tokens",
    );
  });

  test("違反があれば件数を添える", () => {
    const attempt = { art: "x", violations: [{ kind: "empty" as const }], usage };
    expect(formatAttempt(attempt, 1)).toBe(
      "試行 2: claude-opus-5-5 / 5.9 秒 / $0.0107（定価換算） / thinking 0 tokens / 違反 1 件",
    );
  });
});
