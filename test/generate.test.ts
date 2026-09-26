import { describe, expect, test } from "bun:test";
import { errAsync, okAsync } from "neverthrow";
import { asModelId, type Backend, type CompletionRequest, type Usage } from "../src/contract/index.ts";
import { generate } from "../src/core/generate.ts";
import { systemPrompt } from "../src/core/prompt.ts";

const USAGE: Usage = { model: asModelId("fake"), durationMs: 1, costUsd: 0.01, outputTokens: 10, thinkingTokens: 0 };
const SETTINGS = { model: asModelId("claude-opus-5-5"), effort: "low" as const };
const CANVAS = { width: 10, height: 3 };

// 返答を順に返し、受け取った依頼を記録する偽のバックエンド
function fakeBackend(replies: readonly string[]): Backend & { readonly requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    requests,
    complete: (request) => {
      requests.push(request);
      const text = replies[requests.length - 1];
      return text === undefined ? errAsync({ kind: "refused" as const }) : okAsync({ text, usage: USAGE });
    },
  };
}

const run = (backend: Backend, retries = 1, theme = "猫") =>
  generate(theme, { canvas: CANVAS, settings: SETTINGS, retries, backend });

describe("generate", () => {
  test("最初の絵が条件を満たせば、それを返して終わる", async () => {
    const backend = fakeBackend(["```text\n/\\_/\\\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("/\\_/\\");
    expect(result.violations).toEqual([]);
    expect(result.attempts).toHaveLength(1);
    expect(backend.requests).toHaveLength(1);
  });

  test("system prompt、テーマ、モデル設定をバックエンドへ渡す", async () => {
    const backend = fakeBackend(["```text\nok\n```"]);
    await run(backend, 1, "締切前夜");
    expect(backend.requests[0]).toEqual({ system: systemPrompt(CANVAS), prompt: "締切前夜", settings: SETTINGS });
  });

  test("違反した絵は、違反内容を伝えて描き直させる", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\nfixed\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("fixed");
    expect(result.violations).toEqual([]);
    expect(result.attempts.map((a) => a.art)).toEqual(["12345678901", "fixed"]);
    expect(backend.requests[1]?.prompt).toContain("The widest line has 11 columns; the limit is 10.");
  });

  test("描き直しは retries 回まで。尽きたら最後の絵と違反を返す", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\n123456789012\n```", "unused"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("123456789012");
    expect(result.violations).toEqual([{ kind: "tooWide", width: 12, limit: 10 }]);
    expect(backend.requests).toHaveLength(2);
  });

  test("retries が 0 なら描き直さない", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```"]);
    const result = (await run(backend, 0))._unsafeUnwrap();
    expect(result.attempts).toHaveLength(1);
    expect(result.violations).toHaveLength(1);
  });

  test("各試行の使用量を残す", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\nok\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.attempts.map((a) => a.usage)).toEqual([USAGE, USAGE]);
  });

  test("バックエンドの失敗はそのまま返す", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```"]);
    expect((await run(backend))._unsafeUnwrapErr()).toEqual({ kind: "refused" });
  });
});
