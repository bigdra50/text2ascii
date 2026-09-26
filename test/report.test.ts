import { describe, expect, test } from "bun:test";
import { explainFailure, explainViolation, formatAttempt } from "../src/cli/report.ts";
import { asModelId } from "../src/contract/index.ts";

describe("explainViolation", () => {
  test("違反を利用者向けの英文で表す", () => {
    expect(explainViolation({ kind: "empty" })).toBe("the art is empty");
    expect(explainViolation({ kind: "tooWide", width: 72, limit: 60 })).toBe("72 columns wide (limit 60)");
    expect(explainViolation({ kind: "tooTall", height: 24, limit: 20 })).toBe("24 lines tall (limit 20)");
    expect(explainViolation({ kind: "invalidChars", chars: ["猫", "\t"] })).toBe(
      'characters outside printable ASCII ("猫", "\\t")',
    );
  });
});

describe("explainFailure", () => {
  test("バックエンドの失敗を利用者向けの英文で表す", () => {
    expect(explainFailure({ kind: "processFailed", exitCode: 127, stderr: "command not found: claude" })).toBe(
      "claude -p exited with code 127: command not found: claude",
    );
    expect(explainFailure({ kind: "processFailed", exitCode: 1, stderr: "" })).toBe(
      "claude -p exited with code 1 (stderr was empty)",
    );
    expect(explainFailure({ kind: "reportedError", message: "API Error: 529 overloaded" })).toBe(
      "claude -p reported an error: API Error: 529 overloaded",
    );
    expect(explainFailure({ kind: "refused" })).toBe("the model declined to draw this theme");
    expect(explainFailure({ kind: "unreadableOutput", output: "x".repeat(300) })).toBe(
      `could not read the output of claude -p: ${"x".repeat(200)}…`,
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
      "attempt 1: claude-opus-5-5 / 5.9s / $0.0107 (list price) / thinking 0 tokens",
    );
  });

  test("違反があれば件数を添える", () => {
    const attempt = { art: "x", violations: [{ kind: "empty" as const }], usage };
    expect(formatAttempt(attempt, 1)).toBe(
      "attempt 2: claude-opus-5-5 / 5.9s / $0.0107 (list price) / thinking 0 tokens / 1 violation",
    );
  });

  test("token と violation は、数が 1 なら単数形、それ以外は複数形にする", () => {
    const attempt = {
      art: "x",
      violations: [{ kind: "empty" as const }, { kind: "tooTall" as const, height: 24, limit: 20 }],
      usage: { ...usage, thinkingTokens: 1 },
    };
    expect(formatAttempt(attempt, 0)).toBe(
      "attempt 1: claude-opus-5-5 / 5.9s / $0.0107 (list price) / thinking 1 token / 2 violations",
    );
  });
});
