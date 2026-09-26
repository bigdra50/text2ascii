import { describe, expect, test } from "bun:test";
import {
  claudeArgs,
  claudeEnv,
  createClaudeCliBackend,
  parseClaudeOutput,
  type Runner,
} from "../src/backends/claude-cli.ts";
import { asModelId, type CompletionRequest } from "../src/contract/index.ts";

const REQUEST: CompletionRequest = {
  system: "You are an ASCII artist.",
  prompt: "--dangerously-skip-permissions",
  settings: { model: asModelId("claude-opus-5-5"), effort: "low" },
};

// claude -p --output-format json の実際の出力から、使う項目だけを残したもの
const SUCCESS = JSON.stringify({
  type: "result",
  is_error: false,
  result: "```text\n/\\_/\\\n```",
  stop_reason: "end_turn",
  duration_ms: 5900,
  total_cost_usd: 0.0107,
  usage: { output_tokens: 420, output_tokens_details: { thinking_tokens: 0 } },
  modelUsage: { "claude-opus-5-5": { outputTokens: 420 } },
});

describe("claudeArgs", () => {
  const args = claudeArgs(REQUEST);
  const flagValue = (flag: string) => args[args.indexOf(flag) + 1];

  test("モデルと effort を指定する", () => {
    expect(flagValue("--model")).toBe("claude-opus-5-5");
    expect(flagValue("--effort")).toBe("low");
  });

  test("ツール、設定ファイル、MCP、セッション保存を切り、system prompt を差し替える", () => {
    expect(args[0]).toBe("-p");
    expect(flagValue("--tools")).toBe("");
    expect(flagValue("--setting-sources")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(flagValue("--system-prompt")).toBe(REQUEST.system);
    expect(flagValue("--output-format")).toBe("json");
  });

  test("テーマは引数に入れない（オプションとして解釈されないよう標準入力で渡す）", () => {
    expect(args).not.toContain(REQUEST.prompt);
  });
});

describe("claudeEnv", () => {
  test("--effort を上書きしてしまう環境変数を外し、ほかは残す", () => {
    const env = { CLAUDE_CODE_EFFORT_LEVEL: "max", CLAUDE_EFFORT: "max", PATH: "/usr/bin", HOME: "/home/x" };
    expect(claudeEnv(env)).toEqual({ PATH: "/usr/bin", HOME: "/home/x" });
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("max");
  });
});

describe("parseClaudeOutput", () => {
  test("返答の本文と使用量を取り出す", () => {
    expect(parseClaudeOutput(SUCCESS)._unsafeUnwrap()).toEqual({
      text: "```text\n/\\_/\\\n```",
      usage: {
        model: asModelId("claude-opus-5-5"),
        durationMs: 5900,
        costUsd: 0.0107,
        outputTokens: 420,
        thinkingTokens: 0,
      },
    });
  });

  test("is_error なら、返された説明を reportedError にする", () => {
    const output = JSON.stringify({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({
      kind: "reportedError",
      message: "API Error: 529 overloaded",
    });
  });

  test("モデルが生成を断ったら refused", () => {
    const output = JSON.stringify({ type: "result", is_error: false, result: "", stop_reason: "refusal" });
    expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({ kind: "refused" });
  });

  test("JSON として読めない出力や、本文の無い出力は unreadableOutput", () => {
    for (const output of ["not json", "null", JSON.stringify({ is_error: false })]) {
      expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({ kind: "unreadableOutput", output });
    }
  });
});

describe("createClaudeCliBackend", () => {
  test("claude を起動し、テーマを標準入力で渡し、整えた環境変数を使う", async () => {
    const calls: Parameters<Runner>[] = [];
    const run: Runner = async (...args) => {
      calls.push(args);
      return { stdout: SUCCESS, stderr: "", exitCode: 0 };
    };
    const backend = createClaudeCliBackend({ run, env: { CLAUDE_CODE_EFFORT_LEVEL: "max", PATH: "/usr/bin" } });
    const completion = (await backend.complete(REQUEST))._unsafeUnwrap();
    expect(completion.text).toBe("```text\n/\\_/\\\n```");
    const [command, options] = calls[0] ?? [];
    expect(command).toEqual(["claude", ...claudeArgs(REQUEST)]);
    expect(options?.stdin).toBe(REQUEST.prompt);
    expect(options?.env).toEqual({ PATH: "/usr/bin" });
  });

  test("出力が空のまま終わったら processFailed（終了コードと標準エラーを残す）", async () => {
    const run: Runner = async () => ({ stdout: "", stderr: "command not found: claude\n", exitCode: 127 });
    const backend = createClaudeCliBackend({ run, env: {} });
    expect((await backend.complete(REQUEST))._unsafeUnwrapErr()).toEqual({
      kind: "processFailed",
      exitCode: 127,
      stderr: "command not found: claude",
    });
  });

  test("エラーの JSON を出して終了コード 1 で終わった場合は、JSON の説明を使う", async () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    const run: Runner = async () => ({ stdout, stderr: "", exitCode: 1 });
    const backend = createClaudeCliBackend({ run, env: {} });
    expect((await backend.complete(REQUEST))._unsafeUnwrapErr()).toEqual({
      kind: "reportedError",
      message: "API Error: 529 overloaded",
    });
  });
});
