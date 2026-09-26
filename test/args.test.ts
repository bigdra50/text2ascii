import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args.ts";
import { asModelId, DEFAULT_CANVAS, DEFAULT_EFFORT, DEFAULT_MODEL, DEFAULT_RETRIES } from "../src/contract/index.ts";

const generateCommand = (argv: readonly string[]) => {
  const command = parseArgs(argv)._unsafeUnwrap();
  if (command.kind !== "generate") throw new Error(`expected generate, got ${command.kind}`);
  return command;
};

describe("parseArgs", () => {
  test("uses the defaults when nothing is given", () => {
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

  test("joins several positional arguments with spaces into one theme", () => {
    expect(generateCommand(["a", "cat", "sleeping"]).theme).toBe("a cat sleeping");
  });

  test("sets theme to null when none is given (it is read from stdin)", () => {
    expect(generateCommand([]).theme).toBeNull();
  });

  test("reads each option", () => {
    const command = generateCommand(["-m", "claude-sonnet-5", "-e", "high", "--width", "80", "--height", "24"]);
    expect(command.settings).toEqual({ model: asModelId("claude-sonnet-5"), effort: "high" });
    expect(command.canvas).toEqual({ width: 80, height: 24 });
    const flags = generateCommand(["--retries", "0", "--json", "-v", "猫"]);
    expect(flags.retries).toBe(0);
    expect(flags.output).toBe("json");
    expect(flags.verbose).toBe(true);
  });

  test("-h means help and --version means version, ahead of anything else", () => {
    expect(parseArgs(["-h"])._unsafeUnwrap()).toEqual({ kind: "help" });
    expect(parseArgs(["猫", "--help", "--version"])._unsafeUnwrap()).toEqual({ kind: "help" });
    expect(parseArgs(["--version", "猫"])._unsafeUnwrap()).toEqual({ kind: "version" });
  });

  test("accepts only low, medium, high, xhigh, or max for effort", () => {
    expect(parseArgs(["-e", "huge"])._unsafeUnwrapErr().message).toBe(
      "--effort must be one of low, medium, high, xhigh, max: huge",
    );
  });

  test("requires width and height to be integers of at least 1", () => {
    for (const value of ["0", "abc", "2.5"]) {
      expect(parseArgs(["--width", value]).isErr()).toBe(true);
      expect(parseArgs(["--height", value]).isErr()).toBe(true);
    }
    expect(parseArgs(["--width=-5"]).isErr()).toBe(true);
    expect(parseArgs(["--width", "abc"])._unsafeUnwrapErr().message).toBe(
      "--width must be an integer of at least 1: abc",
    );
  });

  test("requires retries to be an integer of at least 0", () => {
    expect(parseArgs(["--retries=-1"])._unsafeUnwrapErr().message).toBe(
      "--retries must be an integer of at least 0: -1",
    );
    expect(generateCommand(["--retries", "3"]).retries).toBe(3);
  });

  test("rejects an empty model", () => {
    expect(parseArgs(["--model", ""])._unsafeUnwrapErr().message).toBe("--model needs a model ID");
  });

  test("reports an unknown option as a usage error", () => {
    expect(parseArgs(["--bogus"])._unsafeUnwrapErr().kind).toBe("usage");
  });

  test("treats everything after -- as the theme, even when it starts with a hyphen", () => {
    expect(generateCommand(["--", "-v", "is", "a", "theme"]).theme).toBe("-v is a theme");
  });
});
