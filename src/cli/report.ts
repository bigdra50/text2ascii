import type { Attempt, BackendFailure, Violation } from "../contract/index.ts";

// Show only the start of unreadable output so it does not flood the terminal
const OUTPUT_PREVIEW = 200;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function explainViolation(violation: Violation): string {
  switch (violation.kind) {
    case "empty":
      return "the art is empty";
    case "tooWide":
      return `${violation.width} columns wide (limit ${violation.limit})`;
    case "tooTall":
      return `${violation.height} lines tall (limit ${violation.limit})`;
    case "invalidChars":
      return `characters outside printable ASCII (${violation.chars.map((c) => JSON.stringify(c)).join(", ")})`;
  }
}

export function explainFailure(failure: BackendFailure): string {
  switch (failure.kind) {
    case "processFailed":
      return failure.stderr === ""
        ? `claude -p exited with code ${failure.exitCode} (stderr was empty)`
        : `claude -p exited with code ${failure.exitCode}: ${failure.stderr}`;
    case "reportedError":
      return `claude -p reported an error: ${failure.message}`;
    case "refused":
      return "the model declined to draw this theme";
    case "unreadableOutput": {
      const cut = failure.output.length > OUTPUT_PREVIEW ? "…" : "";
      return `could not read the output of claude -p: ${failure.output.slice(0, OUTPUT_PREVIEW)}${cut}`;
    }
  }
}

export function formatAttempt(attempt: Attempt, index: number): string {
  const { usage } = attempt;
  return [
    `attempt ${index + 1}: ${usage.model}`,
    `${(usage.durationMs / 1000).toFixed(1)}s`,
    `$${usage.costUsd.toFixed(4)} (list price)`,
    `thinking ${count(usage.thinkingTokens, "token")}`,
    ...(attempt.violations.length > 0 ? [count(attempt.violations.length, "violation")] : []),
  ].join(" / ");
}
