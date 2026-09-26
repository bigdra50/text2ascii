import { describe, expect, test } from "bun:test";
import { errAsync, okAsync } from "neverthrow";
import { asModelId, type Backend, type CompletionRequest, type Usage } from "../src/contract/index.ts";
import { generate } from "../src/core/generate.ts";
import { systemPrompt } from "../src/core/prompt.ts";

const USAGE: Usage = { model: asModelId("fake"), durationMs: 1, costUsd: 0.01, outputTokens: 10, thinkingTokens: 0 };
const SETTINGS = { model: asModelId("claude-opus-5-5"), effort: "low" as const };
const CANVAS = { width: 10, height: 3 };

// A fake backend that returns the given replies in order and records the requests it receives
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
  test("returns the first art when it meets the rules", async () => {
    const backend = fakeBackend(["```text\n/\\_/\\\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("/\\_/\\");
    expect(result.violations).toEqual([]);
    expect(result.attempts).toHaveLength(1);
    expect(backend.requests).toHaveLength(1);
  });

  test("passes the system prompt, theme, and model settings to the backend", async () => {
    const backend = fakeBackend(["```text\nok\n```"]);
    await run(backend, 1, "締切前夜");
    expect(backend.requests[0]).toEqual({ system: systemPrompt(CANVAS), prompt: "締切前夜", settings: SETTINGS });
  });

  test("asks for a redraw with the violations when the art breaks the rules", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\nfixed\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("fixed");
    expect(result.violations).toEqual([]);
    expect(result.attempts.map((a) => a.art)).toEqual(["12345678901", "fixed"]);
    expect(backend.requests[1]?.prompt).toContain("The widest line has 11 columns; the limit is 10.");
  });

  test("redraws at most retries times, then returns the last art and its violations", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\n123456789012\n```", "unused"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.art).toBe("123456789012");
    expect(result.violations).toEqual([{ kind: "tooWide", width: 12, limit: 10 }]);
    expect(backend.requests).toHaveLength(2);
  });

  test("does not redraw when retries is 0", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```"]);
    const result = (await run(backend, 0))._unsafeUnwrap();
    expect(result.attempts).toHaveLength(1);
    expect(result.violations).toHaveLength(1);
  });

  test("keeps the usage of every attempt", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```", "```text\nok\n```"]);
    const result = (await run(backend))._unsafeUnwrap();
    expect(result.attempts.map((a) => a.usage)).toEqual([USAGE, USAGE]);
  });

  test("returns backend failures as they are", async () => {
    const backend = fakeBackend(["```text\n12345678901\n```"]);
    expect((await run(backend))._unsafeUnwrapErr()).toEqual({ kind: "refused" });
  });
});
