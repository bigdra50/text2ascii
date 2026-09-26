import type { Attempt, BackendFailure, Violation } from "../contract/index.ts";

// 読めなかった出力は端末を埋めないよう先頭だけ見せる
const OUTPUT_PREVIEW = 200;

export function explainViolation(violation: Violation): string {
  switch (violation.kind) {
    case "empty":
      return "絵が空だった";
    case "tooWide":
      return `幅が ${violation.width} 列ある（上限 ${violation.limit}）`;
    case "tooTall":
      return `高さが ${violation.height} 行ある（上限 ${violation.limit}）`;
    case "invalidChars":
      return `ASCII 以外の文字を含む（${violation.chars.map((c) => JSON.stringify(c)).join("、")}）`;
  }
}

export function explainFailure(failure: BackendFailure): string {
  switch (failure.kind) {
    case "processFailed":
      return failure.stderr === ""
        ? `claude -p が終了コード ${failure.exitCode} で止まった（標準エラーは空）`
        : `claude -p が終了コード ${failure.exitCode} で止まった: ${failure.stderr}`;
    case "reportedError":
      return `claude -p がエラーを返した: ${failure.message}`;
    case "refused":
      return "モデルがこのテーマの生成を断った";
    case "unreadableOutput": {
      const cut = failure.output.length > OUTPUT_PREVIEW ? "…" : "";
      return `claude -p の出力を読めなかった: ${failure.output.slice(0, OUTPUT_PREVIEW)}${cut}`;
    }
  }
}

export function formatAttempt(attempt: Attempt, index: number): string {
  const { usage } = attempt;
  return [
    `試行 ${index + 1}: ${usage.model}`,
    `${(usage.durationMs / 1000).toFixed(1)} 秒`,
    `$${usage.costUsd.toFixed(4)}（定価換算）`,
    `thinking ${usage.thinkingTokens} tokens`,
    ...(attempt.violations.length > 0 ? [`違反 ${attempt.violations.length} 件`] : []),
  ].join(" / ");
}
