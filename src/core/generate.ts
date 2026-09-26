import { okAsync, type ResultAsync } from "neverthrow";
import type { Attempt, Backend, BackendFailure, Canvas, GenerationResult, ModelSettings } from "../contract/index.ts";
import { extractArt, validateArt } from "./art.ts";
import { retryPrompt, systemPrompt } from "./prompt.ts";

export interface GenerateOptions {
  readonly canvas: Canvas;
  readonly settings: ModelSettings;
  /** Maximum number of redraws after a violation. 0 disables redrawing */
  readonly retries: number;
  readonly backend: Backend;
}

export function generate(theme: string, options: GenerateOptions): ResultAsync<GenerationResult, BackendFailure> {
  const system = systemPrompt(options.canvas);
  const draw = (prompt: string): ResultAsync<Attempt, BackendFailure> =>
    options.backend.complete({ system, prompt, settings: options.settings }).map((completion) => {
      const art = extractArt(completion.text);
      return { art, violations: validateArt(art, options.canvas), usage: completion.usage };
    });

  const continueFrom = (attempts: readonly [Attempt, ...Attempt[]]): ResultAsync<GenerationResult, BackendFailure> => {
    const last = attempts[attempts.length - 1] ?? attempts[0];
    if (last.violations.length === 0 || attempts.length > options.retries) {
      return okAsync({ art: last.art, violations: last.violations, attempts });
    }
    return draw(retryPrompt(theme, last.art, last.violations)).andThen((next) => continueFrom([...attempts, next]));
  };

  return draw(theme).andThen((first) => continueFrom([first]));
}
