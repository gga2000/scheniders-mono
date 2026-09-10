import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../tailwind.config";

// =====================================================================
// Guards the brand-kit palette against a silent, invisible regression.
// =====================================================================
// Tailwind v3 can only apply an opacity modifier to a colour it can break
// into channels. When the palette held bare `var(--bk-ink)` strings, every
// `text-bk-ink/60`, `bg-bk-ink/20` and `border-bk-ink/10` in the section
// library compiled to **nothing** — no warning, no error, no rule. The class
// sat in the shipped HTML matching no CSS: muted text rendered at full ink,
// tinted panels rendered with no background at all, and hairline borders fell
// back to `currentColor`. 45 distinct utilities were dead this way.
// =====================================================================

type ColorFn = (arg: { opacityValue?: string }) => string;

const bkPalette = (
    config.theme?.extend?.colors as Record<string, unknown> | undefined
)?.bk as Record<string, unknown>;

describe("brand-kit palette", () => {
    it("is present", () => {
        expect(bkPalette).toBeTruthy();
        expect(Object.keys(bkPalette).length).toBeGreaterThan(10);
    });

    it.each(Object.keys(bkPalette))(
        "bk-%s accepts an opacity modifier",
        (name) => {
            const value = bkPalette[name];
            // A bare string here is the regression: Tailwind drops the utility.
            expect(typeof value).toBe("function");
            const fn = value as ColorFn;
            const solid = fn({});
            expect(solid).toMatch(/^var\(--bk-[a-z-]+\)$/);
            const faded = fn({ opacityValue: "0.4" });
            expect(faded).toContain("color-mix");
            expect(faded).toContain(solid);
            expect(faded).toContain("0.4");
        },
    );

    it("leaves a solid colour byte-identical to the plain variable", () => {
        // Every existing non-modifier utility must compile exactly as before.
        const ink = bkPalette.ink as ColorFn;
        expect(ink({})).toBe("var(--bk-ink)");
        expect(ink({ opacityValue: undefined })).toBe("var(--bk-ink)");
    });
});

/** Every `bg-|text-|border-…-bk-<name>/<n>` class written anywhere we compile. */
function usedAlphaTokens(): Set<string> {
    const roots = [
        path.resolve(__dirname, "../../../packages/sections/src"),
        path.resolve(__dirname, "../components"),
        path.resolve(__dirname, "../app"),
        path.resolve(__dirname, "../templates"),
    ].filter((d) => fs.existsSync(d));

    const found = new Set<string>();
    const pattern =
        /\b(?:bg|text|border|from|via|to|ring|fill|stroke|shadow|outline|divide|accent|caret)-bk-([a-z-]+)\/\d+/g;

    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(tsx|ts)$/.test(entry.name)) continue;
            const src = fs.readFileSync(full, "utf8");
            for (const m of src.matchAll(pattern)) found.add(m[1]);
        }
    };
    for (const r of roots) walk(r);
    return found;
}

describe("brand-kit alpha utilities in real source", () => {
    const used = usedAlphaTokens();

    it("finds the utilities that were silently dead", () => {
        expect(used.size).toBeGreaterThan(0);
    });

    it.each([...used])(
        "bk-%s is a real palette entry, so the utility compiles",
        (name) => {
            // A token that is not in the palette produces no rule either — the
            // same invisible failure, from a typo instead of a value format.
            expect(Object.keys(bkPalette)).toContain(name);
        },
    );
});
