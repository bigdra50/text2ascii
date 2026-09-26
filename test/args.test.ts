import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args.ts";
import { asModelId, DEFAULT_CANVAS, DEFAULT_EFFORT, DEFAULT_MODEL, DEFAULT_RETRIES } from "../src/contract/index.ts";

const generateCommand = (argv: readonly string[]) => {
  const command = parseArgs(argv)._unsafeUnwrap();
  if (command.kind !== "generate") throw new Error(`generate を期待したが ${command.kind} だった`);
  return command;
};

describe("parseArgs", () => {
  test("指定が無ければ既定値で生成する", () => {
    expect(parseArgs(["猫"])._unsafeUnwrap()).toEqual({
      kind: "generate",
      theme: "猫",
      settings: { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT },
      canvas: DEFAULT_CANVAS,
      retries: DEFAULT_RETRIES,
      output: "text",
      verbose: false,
    });
  });

  test("複数の位置引数は空白でつないで 1 つのテーマにする", () => {
    expect(generateCommand(["a", "cat", "sleeping"]).theme).toBe("a cat sleeping");
  });

  test("テーマが無ければ theme は null（標準入力から読む）", () => {
    expect(generateCommand([]).theme).toBeNull();
  });

  test("各オプションを読む", () => {
    const command = generateCommand(["-m", "claude-sonnet-5", "-e", "high", "--width", "80", "--height", "24"]);
    expect(command.settings).toEqual({ model: asModelId("claude-sonnet-5"), effort: "high" });
    expect(command.canvas).toEqual({ width: 80, height: 24 });
    const flags = generateCommand(["--retries", "0", "--json", "-v", "猫"]);
    expect(flags.retries).toBe(0);
    expect(flags.output).toBe("json");
    expect(flags.verbose).toBe(true);
  });

  test("-h は help、--version は version。ほかの指定より優先する", () => {
    expect(parseArgs(["-h"])._unsafeUnwrap()).toEqual({ kind: "help" });
    expect(parseArgs(["猫", "--help", "--version"])._unsafeUnwrap()).toEqual({ kind: "help" });
    expect(parseArgs(["--version", "猫"])._unsafeUnwrap()).toEqual({ kind: "version" });
  });

  test("effort は low、medium、high、xhigh、max のいずれか", () => {
    expect(parseArgs(["-e", "huge"])._unsafeUnwrapErr().message).toBe(
      "--effort must be one of low, medium, high, xhigh, max: huge",
    );
  });

  test("width と height は 1 以上の整数", () => {
    for (const value of ["0", "abc", "2.5"]) {
      expect(parseArgs(["--width", value]).isErr()).toBe(true);
      expect(parseArgs(["--height", value]).isErr()).toBe(true);
    }
    expect(parseArgs(["--width=-5"]).isErr()).toBe(true);
    expect(parseArgs(["--width", "abc"])._unsafeUnwrapErr().message).toBe(
      "--width must be an integer of at least 1: abc",
    );
  });

  test("retries は 0 以上の整数", () => {
    expect(parseArgs(["--retries=-1"])._unsafeUnwrapErr().message).toBe(
      "--retries must be an integer of at least 0: -1",
    );
    expect(generateCommand(["--retries", "3"]).retries).toBe(3);
  });

  test("model は空にできない", () => {
    expect(parseArgs(["--model", ""])._unsafeUnwrapErr().message).toBe("--model needs a model ID");
  });

  test("知らないオプションは usage のエラー", () => {
    expect(parseArgs(["--bogus"])._unsafeUnwrapErr().kind).toBe("usage");
  });

  test("-- より後ろは、ハイフンで始まってもテーマとして扱う", () => {
    expect(generateCommand(["--", "-v", "is", "a", "theme"]).theme).toBe("-v is a theme");
  });
});
