// =====================================================================
// Tests for slugify — must be Unicode-aware (Iraq/Arabic market).
// =====================================================================

import { describe, expect, it } from "vitest";
import { cn, slugify } from "./utils";

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

describe("cn", () => {
  // The storefront theme registers `border-bk` / `border-bk-bold` as border
  // WIDTHS (tailwind.config borderWidth). Stock tailwind-merge reads any
  // `border-<word>` as a colour, so it dropped the width next to a colour
  // and the hairline vanished.
  it("keeps a bk border width next to a bk border colour", () => {
    expect(cn("border-bk border-bk-divider")).toBe("border-bk border-bk-divider");
    expect(cn("border-bk-bold", "border-bk-ink")).toBe("border-bk-bold border-bk-ink");
    expect(cn("border-t-bk border-bk-divider")).toBe("border-t-bk border-bk-divider");
  });

  it("still lets a later width or colour win", () => {
    expect(cn("border-bk", "border-2")).toBe("border-2");
    expect(cn("border-2", "border-bk-bold")).toBe("border-bk-bold");
    expect(cn("border-bk border-bk-divider", "border-bk-ink")).toBe("border-bk border-bk-ink");
  });
});
