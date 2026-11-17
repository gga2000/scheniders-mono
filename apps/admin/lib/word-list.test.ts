import { describe, expect, it } from "vitest";
import { wordList } from "./word-list";

describe("wordList", () => {
  it("joins names as a sentence does", () => {
    expect(wordList([])).toBe("");
    expect(wordList(["a"])).toBe("a");
    expect(wordList(["a", "b"])).toBe("a and b");
    expect(wordList(["a", "b", "c"])).toBe("a, b and c");
  });

  it("counts the names past the limit", () => {
    expect(wordList(["a", "b", "c"], 3)).toBe("a, b and c");
    expect(wordList(["a", "b", "c", "d"], 3)).toBe("a, b, c and 1 more");
  });
});
