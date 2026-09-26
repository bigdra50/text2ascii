import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fake claude at the front of PATH lets the whole CLI run without calling a model.
// It records its stdin and prints the prepared JSON as is
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

describe("text2ascii end to end with a fake claude", () => {
  test("prints art that meets the rules and exits with 0", async () => {
    const dir = fakeClaude(answer(" /\\_/\\\n( o.o )"));
    const result = await runCli(["猫"], dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(" /\\_/\\\n( o.o )\n");
    expect(readFileSync(join(dir, "stdin.txt"), "utf8")).toBe("猫");
  });

  test("reads the theme from stdin too", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli([], dir, "締切前夜\n");
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, "stdin.txt"), "utf8")).toBe("締切前夜");
  });

  test("prints the last art and exits with 3 when redraws do not fix it", async () => {
    const dir = fakeClaude(answer("0123456789"));
    const result = await runCli(["--width", "5", "--retries", "1", "猫"], dir);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("0123456789\n");
    expect(result.stderr).toContain("text2ascii: the final art breaks the rules: 10 columns wide (limit 5)");
  });

  test("--json prints the art and attempts as JSON, and -v logs per-attempt usage to stderr", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli(["--json", "-v", "猫"], dir);
    expect(JSON.parse(result.stdout)).toMatchObject({ art: "ok", violations: [], attempts: [{ art: "ok" }] });
    expect(result.stderr).toContain("text2ascii: attempt 1: claude-opus-5-5 / 1.2s / $0.0110 (list price)");
  });

  test("prints the error from claude and exits with 1", async () => {
    const dir = fakeClaude({ type: "result", is_error: true, result: "API Error: 529 overloaded" });
    const result = await runCli(["猫"], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("API Error: 529 overloaded");
  });

  test("prints usage and exits with 2 on invalid arguments", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli(["--effort", "huge", "猫"], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("text2ascii: --effort must be one of");
    expect(result.stderr).toContain("Usage: text2ascii");
  });

  test("prints usage and exits with 2 when the theme is empty", async () => {
    const dir = fakeClaude(answer("ok"));
    const result = await runCli([], dir, "  \n");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("text2ascii: give a theme as an argument or on stdin");
    expect(result.stderr).toContain("Usage: text2ascii");
  });
});
