import { parseArgs as parseNodeArgs } from "node:util";
import { err, ok, Result } from "neverthrow";
import {
  asModelId,
  type Canvas,
  DEFAULT_CANVAS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_RETRIES,
  EFFORTS,
  type Effort,
  type ModelSettings,
} from "../contract/index.ts";

export interface UsageFailure {
  readonly kind: "usage";
  readonly message: string;
}

export type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
      readonly kind: "generate";
      /** null なら標準入力から読む */
      readonly theme: string | null;
      readonly settings: ModelSettings;
      readonly canvas: Canvas;
      readonly retries: number;
      readonly output: "text" | "json";
      readonly verbose: boolean;
    };

export const USAGE = `Usage: text2ascii [options] <theme>
       echo <theme> | text2ascii [options]

Turn a theme into ASCII art, with Claude deciding what to draw.

Options:
  -m, --model <id>      model to use (default: ${DEFAULT_MODEL})
  -e, --effort <level>  ${EFFORTS.join(", ")} (default: ${DEFAULT_EFFORT})
      --width <n>       max width of the art, in columns (default: ${DEFAULT_CANVAS.width})
      --height <n>      max height of the art, in lines (default: ${DEFAULT_CANVAS.height})
      --retries <n>     redraws allowed when the art breaks the size or character rules (default: ${DEFAULT_RETRIES})
      --json            print the art and per-attempt usage as JSON
  -v, --verbose         print each attempt's model, time, and list-price cost to stderr
  -h, --help            show this help
      --version         show the version

Exit codes:
  0  printed art that meets the rules
  1  calling Claude failed
  2  invalid arguments
  3  the final art breaks the rules (it is printed anyway)`;

const usage = (message: string): UsageFailure => ({ kind: "usage", message });

const OPTIONS = {
  model: { type: "string", short: "m" },
  effort: { type: "string", short: "e" },
  width: { type: "string" },
  height: { type: "string" },
  retries: { type: "string" },
  json: { type: "boolean" },
  verbose: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
} as const;

const readArgs = Result.fromThrowable(
  (args: readonly string[]) => parseNodeArgs({ args: [...args], options: OPTIONS, allowPositionals: true }),
  (error) => usage(error instanceof Error ? error.message : String(error)),
);

const integer = (
  name: string,
  min: number,
  value: string | undefined,
  fallback: number,
): Result<number, UsageFailure> => {
  if (value === undefined) return ok(fallback);
  return /^\d+$/.test(value) && Number(value) >= min
    ? ok(Number(value))
    : err(usage(`--${name} must be an integer of at least ${min}: ${value}`));
};

const isEffort = (value: string): value is Effort => (EFFORTS as readonly string[]).includes(value);

export function parseArgs(argv: readonly string[]): Result<CliCommand, UsageFailure> {
  return readArgs(argv).andThen(({ values, positionals }): Result<CliCommand, UsageFailure> => {
    if (values.help) return ok({ kind: "help" });
    if (values.version) return ok({ kind: "version" });
    const effort = values.effort ?? DEFAULT_EFFORT;
    if (!isEffort(effort)) {
      return err(usage(`--effort must be one of ${EFFORTS.join(", ")}: ${effort}`));
    }
    const model = values.model ?? DEFAULT_MODEL;
    if (model === "") return err(usage("--model needs a model ID"));
    return Result.combine([
      integer("width", 1, values.width, DEFAULT_CANVAS.width),
      integer("height", 1, values.height, DEFAULT_CANVAS.height),
      integer("retries", 0, values.retries, DEFAULT_RETRIES),
    ]).map(([width, height, retries]) => ({
      kind: "generate",
      theme: positionals.length > 0 ? positionals.join(" ") : null,
      settings: { model: asModelId(model), effort },
      canvas: { width, height },
      retries,
      output: values.json ? "json" : "text",
      verbose: values.verbose ?? false,
    }));
  });
}
