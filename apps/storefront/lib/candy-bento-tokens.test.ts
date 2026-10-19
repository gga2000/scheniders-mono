import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildBrandKitVars, EMPTY_BRAND_KIT } from "@scheniders/shared";

// =====================================================================
// The template's signature card follows the merchant's kit (W7.8).
// =====================================================================
// `.bento-card` and its siblings are applied as class names in 19 files —
// the V1 fallback pages, the schneiders components and the V2 section
// helpers. Every value in them was a literal, so a merchant who recoloured
// their kit still got a black border, a black hard shadow, a white fill and
// a fixed corner radius. Wave 0's `candy-*` sweep replaced utilities in
// components; it never reached this stylesheet.
//
// The Candy palette *is* the default kit, so the rule is that a default
// store must render byte-identical. These tests hold both ends of that: the
// stylesheet carries no literal any more, and every fallback written into it
// is exactly what the default kit emits.
// =====================================================================

const CSS = fs.readFileSync(
    path.resolve(__dirname, "../app/globals.css"),
    "utf8",
);

/** The Candy Bento block, from its banner to the next top-level section. */
function candyBentoBlock(): string {
    const banner = CSS.indexOf("Schneiders — Candy Bento");
    expect(banner).toBeGreaterThan(-1);
    // Back up to the comment's opening marker, so stripping comments below
    // really removes the banner rather than leaving its prose behind.
    const start = CSS.lastIndexOf("/*", banner);
    expect(start).toBeGreaterThan(-1);
    const end = CSS.indexOf("Casing token", start);
    expect(end).toBeGreaterThan(start);
    return CSS.slice(start, end);
}

/** Declarations only — comments explain the old literals on purpose. */
function declarations(block: string): string {
    return block.replace(/\/\*[\s\S]*?\*\//g, "");
}

const vars = buildBrandKitVars(EMPTY_BRAND_KIT) as unknown as Record<
    string,
    string
>;

describe("the signature card reads the brand kit", () => {
    const decls = declarations(candyBentoBlock());

    it("carries no bare colour literal", () => {
        // A literal here silently overrides whatever the merchant chose.
        const bare = decls
            .split("\n")
            .filter((l) => /#[0-9a-fA-F]{6}\b|rgba?\(|:\s*white\b/.test(l))
            .filter((l) => !l.includes("var(--bk-"));
        expect(bare).toEqual([]);
    });

    it("carries no bare border width or corner radius", () => {
        const bare = decls
            .split("\n")
            .filter((l) => /^\s*(border|border-radius):/.test(l))
            .filter((l) => !l.includes("var(--bk-"));
        expect(bare).toEqual([]);
    });

    it("still names the classes 19 files depend on", () => {
        for (const cls of [
            ".bento-card",
            ".bento-card-sm",
            ".bento-card-lg",
            ".bento-card-bold",
            ".chunky-border-bold",
            ".wobbly-button",
            ".zigzag-border",
        ]) {
            expect(decls).toContain(`${cls} {`);
        }
    });
});

describe("a default store renders byte-identical", () => {
    // Each fallback written into globals.css, against what the default kit
    // actually emits. A mismatch means the sweep changed how every existing
    // store looks, which is the one thing it must not do.
    it.each([
        ["--bk-ink", "#1a1a1a"],
        ["--bk-surface-alt", "#ffffff"],
        ["--bk-accent", "#ffd84a"],
        ["--bk-border-thickness", "3px"],
        ["--bk-border-thickness-bold", "4px"],
        ["--bk-radius-card", "16px"],
    ])("%s resolves to the literal it replaced (%s)", (name, literal) => {
        expect(vars[name]).toBe(literal);
    });

    it("keeps the three card sizes in their old proportions", () => {
        // 16px · 0.75 = 12px = the old 0.75rem; 16px · 1.25 = 20px = 1.25rem.
        const radius = Number.parseFloat(vars["--bk-radius-card"]);
        expect(radius * 0.75).toBe(12);
        expect(radius * 1.25).toBe(20);
    });

    it("writes every fallback into the stylesheet as the literal it replaced", () => {
        const decls = declarations(candyBentoBlock());
        for (const [name, literal] of [
            ["--bk-ink", "#1a1a1a"],
            ["--bk-surface-alt", "#ffffff"],
            ["--bk-border-thickness", "3px"],
            ["--bk-radius-card", "16px"],
        ] as const) {
            if (!decls.includes(`var(${name}`)) continue;
            expect(decls).toContain(`var(${name}, ${literal})`);
        }
    });
});

describe("BrandMotion.speed governs every tier", () => {
    const at = (speed: "snappy" | "normal" | "slow") =>
        buildBrandKitVars({
            ...EMPTY_BRAND_KIT,
            motion: { ...EMPTY_BRAND_KIT.motion, speed },
        }) as unknown as Record<string, string>;

    it.each(["--bk-duration-fast", "--bk-duration-base", "--bk-duration-reveal", "--bk-duration-drift"])(
        "%s changes with the merchant's chosen speed",
        (name) => {
            // `reveal` (section entrance) and `drift` (the marquee) were fixed
            // values, so choosing "snappy" changed the hover feedback and
            // nothing about the motion a visitor actually watches.
            const snappy = Number.parseFloat(at("snappy")[name]);
            const normal = Number.parseFloat(at("normal")[name]);
            const slow = Number.parseFloat(at("slow")[name]);
            expect(snappy).toBeLessThan(normal);
            expect(normal).toBeLessThan(slow);
        },
    );

    it("keeps the defaults the storefront already shipped", () => {
        const d = at("normal");
        expect(d["--bk-duration-fast"]).toBe("150ms");
        expect(d["--bk-duration-base"]).toBe("250ms");
        expect(d["--bk-duration-reveal"]).toBe("700ms");
        expect(d["--bk-duration-drift"]).toBe("22000ms");
    });
});

describe("looping motion stops at its start, not mid-stride", () => {
    it("removes the marquee for both the visitor and the merchant switch", () => {
        // The standard reduced-motion reset collapses a duration to ~0, which
        // lands an animation on its final frame. The marquee's final frame is
        // `translateX(-50%)`, so the reset froze every strip half-scrolled.
        expect(CSS).toContain('[data-bk-motion="reduce"] .animate-marquee');
        expect(CSS).toContain("[data-bk-motion] .animate-marquee");
        const rule = CSS.slice(CSS.indexOf('[data-bk-motion="reduce"] .animate-marquee'));
        expect(rule).toContain("animation: none !important");
        expect(rule).toContain("transform: none !important");
    });

    it("takes the section reveal off a fixed duration", () => {
        expect(CSS).toContain("var(--bk-duration-reveal");
        expect(CSS).not.toMatch(/opacity 0\.7s cubic-bezier/);
    });
});
