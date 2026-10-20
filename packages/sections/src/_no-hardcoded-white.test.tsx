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

type Rule = "bg-white" | "text-white" | "white-literal" | "white-keyword";

const RULES: Record<Rule, { pattern: RegExp; fix: string }> = {
  // Any variant or modifier: `bg-white`, `hover:bg-white`, `bg-white/95`.
  "bg-white": {
    pattern: /\bbg-white\b/g,
    fix: "use bg-bk-surface-alt (and pin text-bk-ink if the parent sets another foreground)",
  },
  // A white foreground. Over an ink fill or an ink scrim the partner is
  // `text-bk-surface`; over a primary fill it is `text-bk-on-primary`.
  "text-white": {
    pattern: /\btext-white\b/g,
    fix: "use the fill's partner token: text-bk-surface on ink, text-bk-on-primary on primary",
  },
  // A white colour as a whole string value, e.g. `backgroundColor: "#ffffff"`
  // or `fg: "#fff"`. A `var(--bk-*, #ffffff)` FALLBACK is fine and is not
  // matched: the brand kit always wins over it.
  "white-literal": {
    pattern: /["'`]#fff(?:fff)?["'`]/gi,
    fix: 'use "var(--bk-surface-alt, #ffffff)" for a surface, or the fill\'s --bk-on-* / --bk-surface token for a foreground',
  },
  // The CSS keyword in a value position: `color: "white"`, a ternary branch
  // `? "white"` / `: "white"`, or `fill="white"`. "white" is also a tint
  // enum KEY (`bg="white"`, `bg: "white"`, `z.enum(["white", …])`), which
  // primitives resolve to --bk-surface-alt — those positions are not matched.
  "white-keyword": {
    pattern: /(?<!\b(?:bg|tint)\s*)(?:[?:]|\b(?:color|fill|stroke)\s*=)\s*["'`]white["'`]/g,
    fix: 'use "var(--bk-surface, #ffffff)" (ink\'s partner) or the fill\'s --bk-on-* token',
  },
};

/**
 * RATCHET — not an allowlist.
 *
 * These four PDP files are being rewritten on another branch
 * (feat/pdp-entry-atelier) and are deliberately left untouched here so the
 * two changes do not collide. Each listed rule is pinned to the EXACT number
 * of hits the file has today: adding a white fails (the count is a ceiling,
 * not an exemption), and removing one fails too, so the number must be
 * lowered in the same change. At 0 the rule's entry is deleted, and with
 * no rules left the file's entry is deleted. Nothing may be added.
 */
const PENDING_PDP_FILES: Record<string, Partial<Record<Rule, number>>> = {
  "pdp_add_to_cart.client.tsx": { "bg-white": 2 },
  "pdp_buy_box.client.tsx": { "bg-white": 1, "white-literal": 1 },
  "pdp_direct_order.client.tsx": { "bg-white": 2 },
  "pdp_variants.client.tsx": { "bg-white": 1, "white-literal": 1 },
};

/**
 * The legitimate whites: hero copy over a photo or video, sitting on a FIXED
 * black scrim drawn beneath it (not a brand colour, so neither is the text
 * on it — on a dark kit the scrim is still black). Each entry is pinned to
 * an exact count and to the scrim still being there, so a second white in
 * the file cannot hide behind it.
 */
const SCRIM_FOREGROUNDS: Record<
  string,
  { rule: Rule; count: number; scrim: string }
> = {
  "hero_image.tsx": { rule: "white-literal", count: 1, scrim: "bg-black/40" },
  // Headline + subtitle over `rgba(0,0,0,overlay_opacity)`.
  "hero_video.tsx": { rule: "text-white", count: 2, scrim: "rgba(0,0,0," },
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
          PENDING_PDP_FILES[rel]?.[rule] === undefined &&
          SCRIM_FOREGROUNDS[rel]?.rule !== rule,
      ).flatMap(({ rel, src }) => hits(rel, src, pattern));
      expect(offenders).toEqual([]);
    });
  }

  for (const [file, counts] of Object.entries(PENDING_PDP_FILES)) {
    for (const [rule, count] of Object.entries(counts) as [Rule, number][]) {
      it(`ratchet: ${file} has exactly ${count} ${rule} — lower the count as they are fixed`, () => {
        const entry = FILES.find((f) => f.rel === file);
        const found = entry ? hits(file, entry.src, RULES[rule].pattern) : [];
        expect(
          found,
          found.length > count
            ? `${file} gained a ${rule}: use the brand-kit token instead — the ratchet only goes down`
            : `${file} lost a ${rule}: lower its PENDING_PDP_FILES count to ${found.length} (delete the entry at 0)`,
        ).toHaveLength(count);
      });
    }
  }

  for (const [file, { rule, count, scrim }] of Object.entries(SCRIM_FOREGROUNDS)) {
    it(`${file}: exactly ${count} ${rule}, over its ${scrim} scrim`, () => {
      const entry = FILES.find((f) => f.rel === file);
      const src = entry?.src ?? "";
      expect(src).toContain(scrim);
      expect(hits(file, src, RULES[rule].pattern)).toHaveLength(count);
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
