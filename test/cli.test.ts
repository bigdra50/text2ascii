import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// モデルを呼ばずに CLI 全体を動かすため、PATH の先頭に偽の claude を置く。
// 偽の claude は標準入力を記録し、用意した JSON をそのまま返す
const ROOT = join(import.meta.dir, "..");

function fakeClaude(reply: object): string {
  const dir = mkdtempSync(join(tmpdir(), "text2ascii-cli-"));
  writeFileSync(join(dir, "reply.json"), JSON.stringify(reply));
  writeFileSync(join(dir, "claude"), `#!/bin/sh\ncat > "${dir}/stdin.txt"\ncat "${dir}/reply.json"\n`);
  chmodSync(join(dir, "claude"), 0o755);
  return dir;
}

const answer = (art: string) => ({
  type: "result",
  is_error: false,
  result: `\`\`\`text\n${art}\n\`\`\``,
  duration_ms: 1200,
  total_cost_usd: 0.011,
  usage: { output_tokens: 42, output_tokens_details: { thinking_tokens: 0 } },
  modelUsage: { "claude-opus-5-5": {} },
});

async function runCli(args: readonly string[], dir: string, stdin = "") {
  const proc = Bun.spawn([process.execPath, "src/cli/main.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
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
}

describe("text2ascii（偽の claude で通し実行）", () => {
  test("条件を満たす絵なら、絵を出して終了コード 0", async () => {
    const dir = fakeClaude(answer(" /\\_/\\\n( o.o )"));
    const result = await runCli(["猫"], dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(" /\\_/\\\n( o.o )\n");
    expect(readFileSync(join(dir, "stdin.txt"), "utf8")).toBe("猫");
  });

  test("テーマは標準入力からも読める", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli([], dir, "締切前夜\n");
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, "stdin.txt"), "utf8")).toBe("締切前夜");
  });

  test("描き直しても条件を満たさなければ、最後の絵を出して終了コード 3", async () => {
    const dir = fakeClaude(answer("0123456789"));
    const result = await runCli(["--width", "5", "--retries", "1", "猫"], dir);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("0123456789\n");
    expect(result.stderr).toContain("text2ascii: the final art breaks the rules: 10 columns wide (limit 5)");
  });

  test("--json は絵と試行を JSON で出す。-v は試行ごとの使用量を標準エラーに出す", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli(["--json", "-v", "猫"], dir);
    expect(JSON.parse(result.stdout)).toMatchObject({ art: "ok", violations: [], attempts: [{ art: "ok" }] });
    expect(result.stderr).toContain("text2ascii: attempt 1: claude-opus-5-5 / 1.2s / $0.0110 (list price)");
  });

  test("claude がエラーを返したら、その説明を出して終了コード 1", async () => {
    const dir = fakeClaude({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    const result = await runCli(["猫"], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("API Error: 529 overloaded");
  });

  test("引数が正しくなければ、使い方を出して終了コード 2", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli(["--effort", "huge", "猫"], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("text2ascii: --effort must be one of");
    expect(result.stderr).toContain("Usage: text2ascii");
  });

  test("テーマが空なら、使い方を出して終了コード 2", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli([], dir, "  \n");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("text2ascii: give a theme as an argument or on stdin");
    expect(result.stderr).toContain("Usage: text2ascii");
  });
});
