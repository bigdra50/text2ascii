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

export const USAGE = `使い方: text2ascii [オプション] <テーマ>
       echo <テーマ> | text2ascii [オプション]

テーマの文章から、Claude に描く内容を考えさせて ASCII アートを出力する。

オプション:
  -m, --model <id>      使うモデル（既定: ${DEFAULT_MODEL}）
  -e, --effort <level>  ${EFFORTS.join(", ")}（既定: ${DEFAULT_EFFORT}）
      --width <n>       絵の幅の上限（列数、既定: ${DEFAULT_CANVAS.width}）
      --height <n>      絵の高さの上限（行数、既定: ${DEFAULT_CANVAS.height}）
      --retries <n>     大きさや文字の規則に違反したとき、描き直させる回数（既定: ${DEFAULT_RETRIES}）
      --json            絵と試行ごとの使用量を JSON で出力する
  -v, --verbose         試行ごとのモデル、秒数、定価換算の費用を標準エラーに出す
  -h, --help            この説明を表示する
      --version         版を表示する

終了コード:
  0  条件を満たす絵を出力した
  1  Claude の呼び出しに失敗した
  2  引数が正しくない
  3  描き直しても条件を満たさなかった（最後の絵は出力する）`;

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
    : err(usage(`--${name} には ${min} 以上の整数を指定してください: ${value}`));
};

const isEffort = (value: string): value is Effort => (EFFORTS as readonly string[]).includes(value);

export function parseArgs(argv: readonly string[]): Result<CliCommand, UsageFailure> {
  return readArgs(argv).andThen(({ values, positionals }): Result<CliCommand, UsageFailure> => {
    if (values.help) return ok({ kind: "help" });
    if (values.version) return ok({ kind: "version" });
    const effort = values.effort ?? DEFAULT_EFFORT;
    if (!isEffort(effort)) {
      return err(usage(`--effort には ${EFFORTS.join(", ")} のいずれかを指定してください: ${effort}`));
    }
    const model = values.model ?? DEFAULT_MODEL;
    if (model === "") return err(usage("--model にモデルの ID を指定してください"));
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
