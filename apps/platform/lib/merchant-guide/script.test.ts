import { describe, expect, it } from "vitest";
import { GUIDE_LINES, RECORDED_LINES, guideVoiceSrc, type GuideLineId } from "./script";
import { DELIVERY_CHOICES, FOUNDATION_PLACES, guideHiddenOn } from "./steps";
import { translations } from "@/lib/i18n";

describe("guide script", () => {
    it("every line has words in both languages", () => {
        for (const [id, line] of Object.entries(GUIDE_LINES)) {
            expect(line.ar.trim(), id).not.toBe("");
            expect(line.en.trim(), id).not.toBe("");
        }
    });

    it("only lines that exist can be marked recorded", () => {
        for (const id of RECORDED_LINES) expect(GUIDE_LINES).toHaveProperty(id);
    });

    it("clips live in public/guide-voice by line id", () => {
        expect(guideVoiceSrc("shop.name")).toBe("/guide-voice/shop.name.mp3");
    });

    it("every step and choice speaks a real line and has its labels translated", () => {
        const lines = new Set(Object.keys(GUIDE_LINES) as GuideLineId[]);
        for (const place of Object.values(FOUNDATION_PLACES)) {
            for (const target of place.targets) expect(lines.has(target.line)).toBe(true);
            expect(translations.ar).toHaveProperty(place.labelKey);
            expect(translations.ar).toHaveProperty(place.checkKey);
        }
        for (const choice of Object.values(DELIVERY_CHOICES)) {
            expect(lines.has(choice.line)).toBe(true);
            expect(translations.ar).toHaveProperty(choice.labelKey);
        }
    });

    it("stays out of sign-in, the setup wizard and the till", () => {
        expect(guideHiddenOn("/login")).toBe(true);
        expect(guideHiddenOn("/store/onboarding")).toBe(true);
        expect(guideHiddenOn("/till")).toBe(true);
        expect(guideHiddenOn("/till/customer")).toBe(true);
        expect(guideHiddenOn("/store/edit")).toBe(false);
        expect(guideHiddenOn("/products/new")).toBe(false);
    });
});
