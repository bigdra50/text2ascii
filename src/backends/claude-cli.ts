import { err, ok, Result, ResultAsync } from "neverthrow";
import {
  asModelId,
  type Backend,
  type BackendFailure,
  type Completion,
  type CompletionRequest,
} from "../contract/index.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface RunOptions {
  readonly env: Env;
  readonly stdin: string;
}

/** Runs an external command. Even when it fails to start, it resolves with an exit code and stderr instead of rejecting */
export type Runner = (command: readonly string[], options: RunOptions) => Promise<RunResult>;

export function claudeArgs(request: CompletionRequest): readonly string[] {
  return [
    "-p",
    "--model",
    request.settings.model,
    "--effort",
    request.settings.effort,
    // Loading tools, settings files (including CLAUDE.md), or MCP servers would mix each user's setup into the art.
    // The system prompt is replaced too, so the call matches the comparison that chose the defaults
    "--tools",
    "",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    request.system,
    "--output-format",
    "json",
  ];
}

// When started from a Claude Code session, the parent's effort setting is inherited through these two variables and takes precedence over --effort.
// With max set there, one piece takes minutes even when low is requested (confirmed on 2026-09-27 by capturing the actual request)
const EFFORT_OVERRIDES: readonly string[] = ["CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_EFFORT"];

export const claudeEnv = (env: Env): Env =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !EFFORT_OVERRIDES.includes(key)));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const parseJson = Result.fromThrowable((text: string): unknown => JSON.parse(text));

/** Reads the output of claude -p --output-format json */
export function parseClaudeOutput(stdout: string): Result<Completion, BackendFailure> {
  const unreadable: BackendFailure = { kind: "unreadableOutput", output: stdout };
  return parseJson(stdout)
    .mapErr(() => unreadable)
    .andThen((value): Result<Completion, BackendFailure> => {
      if (!isRecord(value)) return err(unreadable);
      if (value.is_error === true) return err({ kind: "reportedError", message: String(value.result ?? "") });
      if (value.stop_reason === "refusal") return err({ kind: "refused" });
      if (typeof value.result !== "string") return err(unreadable);
      const usage = record(value.usage);
      return ok({
        text: value.result,
        usage: {
          model: asModelId(Object.keys(record(value.modelUsage))[0] ?? "unknown"),
          durationMs: num(value.duration_ms),
          costUsd: num(value.total_cost_usd),
          outputTokens: num(usage.output_tokens),
          thinkingTokens: num(record(usage.output_tokens_details).thinking_tokens),
        },
      });
    });
}

const runProcess: Runner = async (command, { env, stdin }) => {
  try {
    const proc = Bun.spawn([...command], {
      env: { ...env },
      stdin: new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  } catch (error) {
    // The command could not start at all, for example because claude is not on PATH. 127 matches the shell's "command not found"
    return { stdout: "", stderr: error instanceof Error ? error.message : String(error), exitCode: 127 };
  }
};

export interface ClaudeCliOptions {
  readonly run?: Runner;
  readonly env?: Env;
  readonly command?: string;
}

export function createClaudeCliBackend(options: ClaudeCliOptions = {}): Backend {
  const run = options.run ?? runProcess;
  const env = claudeEnv(options.env ?? process.env);
  const command = options.command ?? "claude";
  return {
    // As an argument, a theme starting with "-" would be read as a claude option. On stdin it arrives as plain text
    complete: (request) =>
      ResultAsync.fromSafePromise(run([command, ...claudeArgs(request)], { env, stdin: request.prompt })).andThen(
        (result): Result<Completion, BackendFailure> =>
          // claude can print an is_error JSON and still exit with code 1, so the presence of output decides, not the exit code
          result.stdout.trim() === ""
            ? err({ kind: "processFailed", exitCode: result.exitCode, stderr: result.stderr.trim() })
            : parseClaudeOutput(result.stdout),
      ),
  };
}
