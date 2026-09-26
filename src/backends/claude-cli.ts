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

/** 外部コマンドを実行する。起動に失敗しても reject せず、終了コードと標準エラーで返す */
export type Runner = (command: readonly string[], options: RunOptions) => Promise<RunResult>;

export function claudeArgs(request: CompletionRequest): readonly string[] {
  return [
    "-p",
    "--model",
    request.settings.model,
    "--effort",
    request.settings.effort,
    // ツール、設定ファイル（CLAUDE.md を含む）、MCP を読み込むと、利用者ごとの設定が絵に混ざる。
    // system prompt も差し替え、既定値を決めた比較と同じ条件で呼ぶ
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

// Claude Code のセッションから起動すると、親の effort 設定がこの 2 つの環境変数で引き継がれ、--effort より優先される。
// max が入っていると、low を指定しても 1 枚に数分かかる（2026-09-27 に実際のリクエストを捕捉して確認）
const EFFORT_OVERRIDES: readonly string[] = ["CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_EFFORT"];

export const claudeEnv = (env: Env): Env =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !EFFORT_OVERRIDES.includes(key)));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const parseJson = Result.fromThrowable((text: string): unknown => JSON.parse(text));

/** claude -p --output-format json の出力を読む */
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
    // claude が見つからないなど、起動そのものの失敗。127 はシェルの「コマンドが見つからない」に合わせた
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
    // テーマを引数に置くと、"-" で始まるテーマが claude のオプションとして読まれる。標準入力なら本文として届く
    complete: (request) =>
      ResultAsync.fromSafePromise(run([command, ...claudeArgs(request)], { env, stdin: request.prompt })).andThen(
        (result): Result<Completion, BackendFailure> =>
          // is_error の JSON を出して終了コード 1 で終わることがあるため、終了コードより出力の有無で判断する
          result.stdout.trim() === ""
            ? err({ kind: "processFailed", exitCode: result.exitCode, stderr: result.stderr.trim() })
            : parseClaudeOutput(result.stdout),
      ),
  };
}
