import { describe, expect, test } from "bun:test";
import { describeViolation, extractArt, validateArt } from "../src/core/art.ts";

const CANVAS = { width: 10, height: 3 };

describe("extractArt", () => {
  test("takes the content of a code block with a language tag", () => {
    expect(extractArt("```text\n /\\_/\\\n( o.o )\n```")).toBe(" /\\_/\\\n( o.o )");
  });

  test("handles a code block without a language tag", () => {
    expect(extractArt("```\nabc\n```")).toBe("abc");
  });

  test("treats an unclosed code block as art up to the end", () => {
    expect(extractArt("```text\nabc\ndef")).toBe("abc\ndef");
  });

  test("drops the text before and after the code block", () => {
    expect(extractArt("Here you go:\n```text\nabc\n```\nEnjoy!")).toBe("abc");
  });

  test("treats the whole reply as art when there is no code block", () => {
    expect(extractArt("abc\ndef")).toBe("abc\ndef");
  });

  test("trims leading and trailing blank lines and trailing spaces on each line", () => {
    expect(extractArt("```\n\n  ab  \n cd\t\n\n```")).toBe("  ab\n cd");
  });

  test("keeps leading spaces as part of the art", () => {
    expect(extractArt("```\n    *\n   ***\n```")).toBe("    *\n   ***");
  });

  test("normalizes CRLF line breaks to LF", () => {
    expect(extractArt("```\r\nab\r\ncd\r\n```")).toBe("ab\ncd");
  });
});

describe("validateArt", () => {
  test("reports no violations for ASCII-only art within the limits", () => {
    expect(validateArt("0123456789\nabc\nxyz", CANVAS)).toEqual([]);
  });

  test("reports empty for empty art", () => {
    expect(validateArt("", CANVAS)).toEqual([{ kind: "empty" }]);
    expect(validateArt("   \n  ", CANVAS)).toEqual([{ kind: "empty" }]);
  });

  test("reports tooWide when the longest line exceeds the width limit", () => {
    expect(validateArt("12345678901\nab", CANVAS)).toEqual([{ kind: "tooWide", width: 11, limit: 10 }]);
  });

  test("reports tooTall when the line count exceeds the height limit", () => {
    expect(validateArt("a\nb\nc\nd", CANVAS)).toEqual([{ kind: "tooTall", height: 4, limit: 3 }]);
  });

  test("lists characters outside printable ASCII (32-126) in invalidChars without duplicates", () => {
    expect(validateArt("猫と猫\ta", CANVAS)).toEqual([{ kind: "invalidChars", chars: ["猫", "と", "\t"] }]);
  });

  test("returns every violation when there are several", () => {
    const violations = validateArt("12345678901\nb\nc\n☆", CANVAS);
    expect(violations.map((v) => v.kind)).toEqual(["tooWide", "tooTall", "invalidChars"]);
  });
});

describe("describeViolation", () => {
  test("describes each violation in one English sentence (used in redraw requests)", () => {
    expect(describeViolation({ kind: "tooWide", width: 72, limit: 60 })).toBe(
      "The widest line has 72 columns; the limit is 60.",
    );
    expect(describeViolation({ kind: "tooTall", height: 24, limit: 20 })).toBe("It has 24 rows; the limit is 20.");
    expect(describeViolation({ kind: "invalidChars", chars: ["猫", "\t"] })).toBe(
      'It contains characters outside printable ASCII: "猫", "\\t".',
    );
    expect(describeViolation({ kind: "empty" })).toBe("The reply contained no drawing.");
  });
});
