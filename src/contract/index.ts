// Types passed between the CLI, the generation logic, and the backends. Any implementation may be rewritten as long as it satisfies these types
import type { ResultAsync } from "neverthrow";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

declare const modelIdBrand: unique symbol;
/** A Claude model ID such as claude-opus-5-5. claude -p also accepts aliases such as opus */
export type ModelId = string & { readonly [modelIdBrand]: true };
export const asModelId = (value: string): ModelId => value as ModelId;

/** Size limits for the art. width is in columns (characters) and height in lines */
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
  /** The model that actually answered. Holds the resolved ID even when an alias was requested */
  readonly model: ModelId;
  readonly durationMs: number;
  /** Cost at API list prices. Calls through a subscription report this figure too, not the amount actually billed */
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

/** A way to call Claude. Both claude -p and the API return results in this shape */
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
  /** Violations in the last attempt. Empty means the art meets the rules */
  readonly violations: readonly Violation[];
  /** The first element is the first attempt */
  readonly attempts: readonly [Attempt, ...Attempt[]];
}

// The defaults come from the 2026-09-27 comparison (4 models x effort levels x 5 themes, averaged over two judges).
// Opus 5.5 at low scored 4.0 on average at 6 s and $0.011 per piece. Higher effort did not raise the score, only the time and cost
export const DEFAULT_MODEL = asModelId("claude-opus-5-5");
export const DEFAULT_EFFORT: Effort = "low";
export const DEFAULT_CANVAS: Canvas = { width: 60, height: 20 };
// Each redraw costs the time and money of one more piece, so the default allows only one
export const DEFAULT_RETRIES = 1;
