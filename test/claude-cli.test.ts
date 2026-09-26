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

// Real claude -p --output-format json output, trimmed to the fields this code reads
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

  test("passes the model and effort", () => {
    expect(flagValue("--model")).toBe("claude-opus-5-5");
    expect(flagValue("--effort")).toBe("low");
  });

  test("turns off tools, settings files, MCP, and session persistence, and replaces the system prompt", () => {
    expect(args[0]).toBe("-p");
    expect(flagValue("--tools")).toBe("");
    expect(flagValue("--setting-sources")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(flagValue("--system-prompt")).toBe(REQUEST.system);
    expect(flagValue("--output-format")).toBe("json");
  });

  test("keeps the theme out of the arguments (it goes on stdin so it is never parsed as an option)", () => {
    expect(args).not.toContain(REQUEST.prompt);
  });
});

describe("claudeEnv", () => {
  test("removes the environment variables that would override --effort and keeps the rest", () => {
    const env = { CLAUDE_CODE_EFFORT_LEVEL: "max", CLAUDE_EFFORT: "max", PATH: "/usr/bin", HOME: "/home/x" };
    expect(claudeEnv(env)).toEqual({ PATH: "/usr/bin", HOME: "/home/x" });
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("max");
  });
});

describe("parseClaudeOutput", () => {
  test("extracts the reply text and usage", () => {
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

  test("turns is_error into reportedError with the returned message", () => {
    const output = JSON.stringify({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({
      kind: "reportedError",
      message: "API Error: 529 overloaded",
    });
  });

  test("returns refused when the model declines", () => {
    const output = JSON.stringify({ type: "result", is_error: false, result: "", stop_reason: "refusal" });
    expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({ kind: "refused" });
  });

  test("returns unreadableOutput for output that is not JSON or has no reply text", () => {
    for (const output of ["not json", "null", JSON.stringify({ is_error: false })]) {
      expect(parseClaudeOutput(output)._unsafeUnwrapErr()).toEqual({ kind: "unreadableOutput", output });
    }
  });
});

describe("createClaudeCliBackend", () => {
  test("starts claude with the theme on stdin and the cleaned environment", async () => {
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

  test("returns processFailed with the exit code and stderr when there is no output", async () => {
    const run: Runner = async () => ({ stdout: "", stderr: "command not found: claude\n", exitCode: 127 });
    const backend = createClaudeCliBackend({ run, env: {} });
    expect((await backend.complete(REQUEST))._unsafeUnwrapErr()).toEqual({
      kind: "processFailed",
      exitCode: 127,
      stderr: "command not found: claude",
    });
  });

  test("uses the JSON message when claude prints an error JSON and exits with code 1", async () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    const run: Runner = async () => ({ stdout, stderr: "", exitCode: 1 });
    const backend = createClaudeCliBackend({ run, env: {} });
    expect((await backend.complete(REQUEST))._unsafeUnwrapErr()).toEqual({
      kind: "reportedError",
      message: "API Error: 529 overloaded",
    });
  });
});
