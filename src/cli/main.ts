#!/usr/bin/env bun
// The text2ascii CLI. Takes a theme, has Claude draw ASCII art, and prints it to stdout
import pkg from "../../package.json" with { type: "json" };
import { createClaudeCliBackend } from "../backends/claude-cli.ts";
import { generate } from "../core/generate.ts";
import { type CliCommand, parseArgs, USAGE } from "./args.ts";
import { explainFailure, explainViolation, formatAttempt } from "./report.ts";

const say = (message: string) => console.error(`text2ascii: ${message}`);

async function readTheme(fromArgs: string | null): Promise<string> {
  if (fromArgs !== null) return fromArgs.trim();
  // When started directly from a terminal, waiting on stdin would look like a hang, so stdin is not read
  if (process.stdin.isTTY) return "";
  return (await Bun.stdin.text()).trim();
}

async function runGenerate(command: Extract<CliCommand, { kind: "generate" }>): Promise<number> {
  const theme = await readTheme(command.theme);
  if (theme === "") {
    say("give a theme as an argument or on stdin");
    console.error(USAGE);
    return 2;
  }
  const result = await generate(theme, {
    canvas: command.canvas,
    settings: command.settings,
    retries: command.retries,
    backend: createClaudeCliBackend(),
  });
  return result.match(
    (generation) => {
      console.log(command.output === "json" ? JSON.stringify(generation, null, 2) : generation.art);
      if (command.verbose) {
        for (const [i, attempt] of generation.attempts.entries()) say(formatAttempt(attempt, i));
      }
      if (generation.violations.length === 0) return 0;
      say(`the final art breaks the rules: ${generation.violations.map(explainViolation).join("; ")}`);
      return 3;
    },
    (failure) => {
      say(explainFailure(failure));
      return 1;
    },
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.isErr()) {
    say(parsed.error.message);
    console.error(USAGE);
    return 2;
  }
  const command = parsed.value;
  switch (command.kind) {
    case "help":
      console.log(USAGE);
      return 0;
    case "version":
      console.log(pkg.version);
      return 0;
    case "generate":
      return runGenerate(command);
  }
}

process.exitCode = await main(process.argv.slice(2));
