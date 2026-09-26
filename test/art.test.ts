import { describe, expect, test } from "bun:test";
import { describeViolation, extractArt, validateArt } from "../src/core/art.ts";

const CANVAS = { width: 10, height: 3 };

describe("extractArt", () => {
  test("言語名付きのコードブロックから中身を取り出す", () => {
    expect(extractArt("```text\n /\\_/\\\n( o.o )\n```")).toBe(" /\\_/\\\n( o.o )");
  });

  test("言語名の無いコードブロックも扱う", () => {
    expect(extractArt("```\nabc\n```")).toBe("abc");
  });

  test("閉じていないコードブロックは、末尾までを絵として扱う", () => {
    expect(extractArt("```text\nabc\ndef")).toBe("abc\ndef");
  });

  test("コードブロックの前後の文章は捨てる", () => {
    expect(extractArt("Here you go:\n```text\nabc\n```\nEnjoy!")).toBe("abc");
  });

  test("コードブロックが無ければ返答全体を絵として扱う", () => {
    expect(extractArt("abc\ndef")).toBe("abc\ndef");
  });

  test("先頭と末尾の空行と、各行の末尾の空白を取り除く", () => {
    expect(extractArt("```\n\n  ab  \n cd\t\n\n```")).toBe("  ab\n cd");
  });

  test("行頭の空白は絵の一部として残す", () => {
    expect(extractArt("```\n    *\n   ***\n```")).toBe("    *\n   ***");
  });

  test("CRLF の改行を LF にそろえる", () => {
    expect(extractArt("```\r\nab\r\ncd\r\n```")).toBe("ab\ncd");
  });
});

describe("validateArt", () => {
  test("上限内の ASCII だけの絵は違反なし", () => {
    expect(validateArt("0123456789\nabc\nxyz", CANVAS)).toEqual([]);
  });

  test("空の絵は empty", () => {
    expect(validateArt("", CANVAS)).toEqual([{ kind: "empty" }]);
    expect(validateArt("   \n  ", CANVAS)).toEqual([{ kind: "empty" }]);
  });

  test("最も長い行が上限を超えたら tooWide", () => {
    expect(validateArt("12345678901\nab", CANVAS)).toEqual([{ kind: "tooWide", width: 11, limit: 10 }]);
  });

  test("行数が上限を超えたら tooTall", () => {
    expect(validateArt("a\nb\nc\nd", CANVAS)).toEqual([{ kind: "tooTall", height: 4, limit: 3 }]);
  });

  test("印字できる ASCII（32〜126）以外の文字は、重複を除いて invalidChars に並べる", () => {
    expect(validateArt("猫と猫\ta", CANVAS)).toEqual([{ kind: "invalidChars", chars: ["猫", "と", "\t"] }]);
  });

  test("複数の違反はすべて返す", () => {
    const violations = validateArt("12345678901\nb\nc\n☆", CANVAS);
    expect(violations.map((v) => v.kind)).toEqual(["tooWide", "tooTall", "invalidChars"]);
  });
});

describe("describeViolation", () => {
  test("違反の内容を英語の一文で表す（描き直しの指示に使う）", () => {
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
