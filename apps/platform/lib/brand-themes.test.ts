/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { BRAND_THEMES } from "./brand-themes";
import { ARABIC_GOOGLE_FONTS, GOOGLE_FONTS } from "@/components/store-builder-v2/brand-kit-editor";
import { WEIGHT_COMPLETE_FONTS } from "@/lib/weight-complete-fonts";

// Mirror the emitter's on-color choice (brand-kit-vars onColor): white
// text when luminance < 0.5, else the kit ink. A theme must never ship
// a button pair below WCAG AA.

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLuminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
    const la = relLuminance(hexToRgb(a));
    const lb = relLuminance(hexToRgb(b));
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

describe("BRAND_THEMES", () => {
    it("has unique ids", () => {
        const ids = BRAND_THEMES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("every primary passes AA against its emitter-chosen button text", () => {
        for (const theme of BRAND_THEMES) {
            const { primary, ink } = theme.colors;
            const fg = relLuminance(hexToRgb(primary)) < 0.5 ? "#ffffff" : ink;
            const ratio = contrast(primary, fg);
            expect(
                ratio,
                `${theme.id}: primary ${primary} on ${fg} = ${ratio.toFixed(2)}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("body text (ink) passes AA on both surfaces", () => {
        for (const theme of BRAND_THEMES) {
            const { ink, surface, surface_alt } = theme.colors;
            expect(
                contrast(ink, surface),
                `${theme.id}: ink on surface`,
            ).toBeGreaterThanOrEqual(4.5);
            expect(
                contrast(ink, surface_alt),
                `${theme.id}: ink on surface_alt`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("every theme font exists in the editor's Google Fonts catalogue", () => {
        for (const theme of BRAND_THEMES) {
            expect(
                GOOGLE_FONTS.includes(theme.typography.display),
                `${theme.id}: display font "${theme.typography.display}"`,
            ).toBe(true);
            expect(
                GOOGLE_FONTS.includes(theme.typography.body),
                `${theme.id}: body font "${theme.typography.body}"`,
            ).toBe(true);
        }
    });

    it("every Arabic theme font exists in the editor's Arabic catalogue", () => {
        for (const theme of BRAND_THEMES) {
            const { display_ar, body_ar } = theme.typography;
            for (const family of [display_ar, body_ar]) {
                expect(family, `${theme.id}: Arabic font missing`).toBeTruthy();
                expect(
                    ARABIC_GOOGLE_FONTS.includes(family ?? ""),
                    `${theme.id}: Arabic font "${family}"`,
                ).toBe(true);
            }
        }
    });

    it("every Arabic body font ships 400/500/600/700", () => {
        for (const theme of BRAND_THEMES) {
            const family = theme.typography.body_ar ?? "";
            expect(
                WEIGHT_COMPLETE_FONTS.has(family),
                `${theme.id}: body_ar "${family}" is not a verified weight-complete family`,
            ).toBe(true);
        }
    });

    it("every theme is trilingual-named", () => {
        for (const theme of BRAND_THEMES) {
            expect(theme.name.ar.length).toBeGreaterThan(0);
            expect(theme.name.en.length).toBeGreaterThan(0);
            expect(theme.name.ku.length).toBeGreaterThan(0);
        }
    });
});
