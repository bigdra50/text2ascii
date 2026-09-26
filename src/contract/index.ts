// CLI、生成処理、バックエンドの間で受け渡す型。実装はこの型を満たす限り作り直してよい
import type { ResultAsync } from "neverthrow";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

declare const modelIdBrand: unique symbol;
/** Claude のモデル ID（claude-opus-5-5 など）。claude -p は opus などの別名も受け付ける */
export type ModelId = string & { readonly [modelIdBrand]: true };
export const asModelId = (value: string): ModelId => value as ModelId;

/** 絵の大きさの上限。width は列数（文字数）、height は行数 */
export interface Canvas {
  readonly width: number;
  readonly height: number;
}

export interface ModelSettings {
  readonly model: ModelId;
  readonly effort: Effort;
}

export interface CompletionRequest {
  readonly system: string;
  readonly prompt: string;
  readonly settings: ModelSettings;
}

export interface Usage {
  /** 実際に応答したモデル。別名で指定しても解決後の ID が入る */
  readonly model: ModelId;
  readonly durationMs: number;
  /** API 定価換算の額。サブスクリプション経由の呼び出しでも、請求額ではなくこの換算値になる */
  readonly costUsd: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
}

export interface Completion {
  readonly text: string;
  readonly usage: Usage;
}

export type BackendFailure =
  | { readonly kind: "processFailed"; readonly exitCode: number; readonly stderr: string }
  | { readonly kind: "unreadableOutput"; readonly output: string }
  | { readonly kind: "reportedError"; readonly message: string }
  | { readonly kind: "refused" };

/** Claude を呼ぶ手段。claude -p でも API でも、この形で返す */
export interface Backend {
  readonly complete: (request: CompletionRequest) => ResultAsync<Completion, BackendFailure>;
}

export type Violation =
  | { readonly kind: "empty" }
  | { readonly kind: "tooWide"; readonly width: number; readonly limit: number }
  | { readonly kind: "tooTall"; readonly height: number; readonly limit: number }
  | { readonly kind: "invalidChars"; readonly chars: readonly string[] };

export interface Attempt {
  readonly art: string;
  readonly violations: readonly Violation[];
  readonly usage: Usage;
}

export interface GenerationResult {
  readonly art: string;
  /** 最後の試行の違反。空なら条件を満たしている */
  readonly violations: readonly Violation[];
  /** 先頭が最初の試行 */
  readonly attempts: readonly [Attempt, ...Attempt[]];
}

// 既定値の根拠は 2026-09-27 の比較（4 モデル x effort x 5 テーマ、2 人の採点者の平均）。
// Opus 5.5 の low は 1 枚 6 秒・$0.011 で平均 4.0 点。effort を上げても点は伸びず、時間と費用だけが増えた
export const DEFAULT_MODEL = asModelId("claude-opus-5-5");
export const DEFAULT_EFFORT: Effort = "low";
export const DEFAULT_CANVAS: Canvas = { width: 60, height: 20 };
// 描き直しは 1 回ごとに 1 枚分の時間と費用がかかるため、既定は 1 回にとどめる
export const DEFAULT_RETRIES = 1;
