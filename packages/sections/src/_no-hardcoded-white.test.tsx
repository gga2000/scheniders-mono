// =====================================================================
// Sections paint with the brand kit, never with literal white
// =====================================================================
// Every store template recolours the section library through `--bk-*`
// tokens. Two of them (Kinetic Ink, Chrome Night) have a dark ground, where
// ink — the foreground almost every section uses — is the LIGHT colour. A
// hardcoded white surface there is not "a white card": it is light text on
// a white card, unreadable at ~1.1:1. The card surface is `--bk-surface-alt`
// (`bg-bk-surface-alt`, or `var(--bk-surface-alt, #ffffff)` inline); a fill's
// foreground is its own `--bk-on-*` / `--bk-surface` token.
//
// This scans source, not rendered markup, so it also covers states the
// default render never reaches (an open accordion row, a filled cart, a
// countdown that is still ticking).
// =====================================================================

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BentoCard, Sticker } from "./helpers/primitives";

const SRC = path.dirname(fileURLToPath(import.meta.url));

type Rule = "bg-white" | "white-literal";

const RULES: Record<Rule, { pattern: RegExp; fix: string }> = {
  // Any variant or modifier: `bg-white`, `hover:bg-white`, `bg-white/95`.
  "bg-white": {
    pattern: /\bbg-white\b/g,
    fix: "use bg-bk-surface-alt (and pin text-bk-ink if the parent sets another foreground)",
  },
  // A white colour as a whole string value, e.g. `backgroundColor: "#ffffff"`
  // or `fg: "#fff"`. A `var(--bk-*, #ffffff)` FALLBACK is fine and is not
  // matched: the brand kit always wins over it.
  "white-literal": {
    pattern: /["'`]#fff(?:fff)?["'`]/gi,
    fix: 'use "var(--bk-surface-alt, #ffffff)" for a surface, or the fill\'s --bk-on-* / --bk-surface token for a foreground',
  },
};

/**
 * RATCHET — not an allowlist.
 *
 * These four PDP files are being rewritten on another branch
 * (feat/pdp-entry-atelier) and are deliberately left untouched here so the
 * two changes do not collide. The test asserts each one STILL breaks the
 * listed rule: once that branch removes the white, this test fails and the
 * entry must be deleted, so the list can only shrink. Nothing may be added.
 */
const PENDING_PDP_FILES: Record<string, readonly Rule[]> = {
  "pdp_add_to_cart.client.tsx": ["bg-white"],
  "pdp_buy_box.client.tsx": ["bg-white", "white-literal"],
  "pdp_direct_order.client.tsx": ["bg-white"],
  "pdp_variants.client.tsx": ["bg-white", "white-literal"],
};

/**
 * The one legitimate white: a headline over a photo, sitting on the fixed
 * `bg-black/40` scrim drawn beneath it. The scrim is not a brand colour, so
 * neither is the text on it. Pinned to an exact count and to the scrim
 * still being there, so a second white in the file cannot hide behind it.
 */
const SCRIM_FOREGROUNDS: Record<string, { count: number; scrim: string }> = {
  "hero_image.tsx": { count: 1, scrim: "bg-black/40" },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/** `file:line` for every match, so a failure names the exact spot. */
function hits(rel: string, src: string, pattern: RegExp): string[] {
  return [...src.matchAll(pattern)].map((m) => {
    const line = src.slice(0, m.index).split("\n").length;
    return `${rel}:${line}  ${m[0]}`;
  });
}

const FILES = sourceFiles(SRC).map((full) => ({
  rel: path.relative(SRC, full),
  src: readFileSync(full, "utf8"),
}));

describe("sections carry no hardcoded white", () => {
  it("scans the whole section library", () => {
    // Guards the scan itself: a broken walk would pass every rule vacuously.
    expect(FILES.length).toBeGreaterThan(100);
    for (const name of [
      ...Object.keys(PENDING_PDP_FILES),
      ...Object.keys(SCRIM_FOREGROUNDS),
    ]) {
      expect(
        FILES.some((f) => f.rel === name),
        `${name} is listed here but no longer exists — delete its entry`,
      ).toBe(true);
    }
  });

  for (const [rule, { pattern, fix }] of Object.entries(RULES) as [
    Rule,
    (typeof RULES)[Rule],
  ][]) {
    it(`no ${rule} outside the pending PDP files (${fix})`, () => {
      const offenders = FILES.filter(
        ({ rel }) =>
          !PENDING_PDP_FILES[rel]?.includes(rule) &&
          !(rule === "white-literal" && rel in SCRIM_FOREGROUNDS),
      ).flatMap(({ rel, src }) => hits(rel, src, pattern));
      expect(offenders).toEqual([]);
    });
  }

  for (const [file, rules] of Object.entries(PENDING_PDP_FILES)) {
    for (const rule of rules) {
      it(`ratchet: ${file} still has ${rule} — delete it from PENDING_PDP_FILES once fixed`, () => {
        const entry = FILES.find((f) => f.rel === file);
        const found = entry ? hits(file, entry.src, RULES[rule].pattern) : [];
        expect(
          found.length,
          `${file} no longer contains ${rule}: remove it from PENDING_PDP_FILES so it is guarded`,
        ).toBeGreaterThan(0);
      });
    }
  }

  for (const [file, { count, scrim }] of Object.entries(SCRIM_FOREGROUNDS)) {
    it(`${file}: exactly ${count} white headline, over its ${scrim} scrim`, () => {
      const entry = FILES.find((f) => f.rel === file);
      const src = entry?.src ?? "";
      expect(src).toContain(scrim);
      expect(hits(file, src, RULES["white-literal"].pattern)).toHaveLength(count);
    });
  }
});

describe("shared primitives resolve their surfaces through the brand kit", () => {
  // BentoCard defaults to bg="white" and is the card behind most sections,
  // so this one table decides whether a dark kit gets white cards.
  it('a default BentoCard is the card surface with ink on it', () => {
    const html = renderToStaticMarkup(<BentoCard>x</BentoCard>);
    expect(html).toContain("bg-bk-surface-alt");
    expect(html).toContain("background-color:var(--bk-surface-alt, #ffffff)");
    expect(html).toContain("color:var(--bk-ink, #1a1a1a)");
    expect(html).not.toMatch(/background-color:#fff/i);
  });

  it("an ink fill takes the page surface as its foreground, not white", () => {
    const html = renderToStaticMarkup(<Sticker bg="ink">x</Sticker>);
    expect(html).toContain("bg-bk-ink text-bk-surface");
    expect(html).toContain("color:var(--bk-surface, #ffffff)");
    expect(html).not.toMatch(/text-white|color:#fff/i);
  });

  it("a primary fill takes its on-primary foreground", () => {
    const html = renderToStaticMarkup(<Sticker bg="pink">x</Sticker>);
    expect(html).toContain("bg-bk-primary text-bk-on-primary");
    expect(html).not.toContain("text-white");
  });
});
