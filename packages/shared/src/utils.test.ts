// =====================================================================
// Tests for slugify — must be Unicode-aware (Iraq/Arabic market).
// =====================================================================

import { describe, expect, it } from "vitest";
import { slugify } from "./utils";

describe("slugify", () => {
  it("slugifies Latin text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Spaced  Out  ")).toBe("spaced-out");
    expect(slugify("Already-Slugged")).toBe("already-slugged");
  });

  it("keeps Arabic letters instead of stripping them", () => {
    // The whole point: an Arabic name must NOT collapse to an empty slug.
    expect(slugify("ويفر")).toBe("ويفر");
    expect(slugify("كل المنتجات")).toBe("كل-المنتجات");
  });

  it("drops punctuation, symbols and emoji but keeps letters/digits", () => {
    expect(slugify("Wafer 2.0 🎉")).toBe("wafer-20");
    expect(slugify("منتج #1")).toBe("منتج-1");
  });

  it("returns empty string when there is nothing slug-worthy", () => {
    expect(slugify("!!! ✨ ---")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("collapses repeated separators and trims edge hyphens", () => {
    expect(slugify("a   --  b")).toBe("a-b");
    expect(slugify("-leading and trailing-")).toBe("leading-and-trailing");
  });
});
