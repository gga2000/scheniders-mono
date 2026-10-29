import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../tailwind.config";

// =====================================================================
// The chapter type step (PDP redesign §1.1): one token, three surfaces
// =====================================================================
// `--bk-text-chapter` is the 22px/900 heading of the redesigned product
// page. The storefront (Tailwind v3, JS config) and the platform's builder
// chrome (Tailwind v4, CSS-first) each declare the bk-* type tokens on
// their own, so a token added to one and not the other renders as a bare
// class in the other. Both are pinned here, with the same value.
// =====================================================================

const CHAPTER = "clamp(1.375rem, 5.6vw, 1.625rem)";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");

describe("--bk-text-chapter", () => {
  it("is declared in the storefront stylesheet", () => {
    expect(read("../app/globals.css")).toContain(`--bk-text-chapter: ${CHAPTER};`);
  });

  it("is declared in the platform stylesheet with its v4 utility at line height 1.2", () => {
    const css = read("../../platform/app/globals.css");
    expect(css).toContain(`--bk-text-chapter: ${CHAPTER};`);
    expect(css).toContain("--text-bk-chapter: var(--bk-text-chapter);");
    expect(css).toContain("--text-bk-chapter--line-height: 1.2;");
  });

  it("maps to text-bk-chapter in the storefront Tailwind config, safelisted", () => {
    expect(config.theme?.extend?.fontSize).toMatchObject({
      "bk-chapter": ["var(--bk-text-chapter)", { lineHeight: "1.2" }],
    });
    const patterns = (config.safelist ?? []).flatMap((entry) =>
      typeof entry === "string" ? [] : [entry.pattern],
    );
    expect(patterns.some((p) => p.test("text-bk-chapter"))).toBe(true);
  });
});
