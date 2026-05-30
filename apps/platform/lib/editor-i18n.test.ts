// =====================================================================
// editor-i18n.test.ts — resolver + dictionary coverage
// =====================================================================

import { describe, expect, it } from "vitest";
import {
    STRINGS,
    countUntranslated,
    listStringKeys,
    t,
    tFormat,
    type EditorString,
} from "./editor-i18n";

describe("t() resolver", () => {
    it("returns the requested locale when present", () => {
        const s: EditorString = {
            en: "Publish",
            ar: "نشر",
            ku: "بڵاوکردنەوە",
        };
        expect(t(s, "ar")).toBe("نشر");
        expect(t(s, "ku")).toBe("بڵاوکردنەوە");
        expect(t(s, "en")).toBe("Publish");
    });

    it("falls back to en when the requested locale is missing", () => {
        const s = {
            en: "Cancel",
            ar: "",
            ku: "",
        } as EditorString;
        expect(t(s, "ar")).toBe("Cancel");
        expect(t(s, "ku")).toBe("Cancel");
    });

    it("falls back to the first defined value when en is also missing", () => {
        // Bypass the type system to simulate a broken entry — exercising
        // the deterministic last-resort scan.
        const s = {
            en: "",
            ar: "",
            ku: "بەش",
        } as EditorString;
        expect(t(s, "en")).toBe("بەش");
        expect(t(s, "ar")).toBe("بەش");
    });

    it("returns '' for an undefined string (defensive)", () => {
        expect(t(undefined, "en")).toBe("");
    });
});

describe("tFormat()", () => {
    it("substitutes {key} placeholders", () => {
        const s: EditorString = {
            en: "Saved {n}s ago",
            ar: "تم الحفظ منذ {n}ث",
            ku: "{n}س لەمەوبەر خەزنکرا",
        };
        expect(tFormat(s, "en", { n: 5 })).toBe("Saved 5s ago");
        expect(tFormat(s, "ar", { n: 5 })).toBe("تم الحفظ منذ 5ث");
    });

    it("leaves unmatched placeholders intact so they surface in QA", () => {
        const s: EditorString = {
            en: "Hello {name}, you have {count} items",
            ar: "Hello {name}, you have {count} items",
            ku: "Hello {name}, you have {count} items",
        };
        expect(tFormat(s, "en", { name: "Ali" })).toBe("Hello Ali, you have {count} items");
    });
});

describe("STRINGS dictionary", () => {
    it("has key strings with all three locales populated", () => {
        // Spot-check a handful of high-traffic strings.
        const checks: EditorString[] = [
            STRINGS.publish.button,
            STRINGS.save_state.saving,
            STRINGS.section_list.heading,
            STRINGS.page_tree.settings_heading,
            STRINGS.section_edit.tab_properties,
            STRINGS.section_edit.tab_visibility,
            STRINGS.section_edit.tab_variants,
        ];
        for (const s of checks) {
            expect(s.en.length).toBeGreaterThan(0);
            expect(s.ar.length).toBeGreaterThan(0);
            expect(s.ku.length).toBeGreaterThan(0);
            // Must NOT be the en string mirrored as ar/ku for high-traffic strings.
            expect(s.ar).not.toBe(s.en);
            expect(s.ku).not.toBe(s.en);
        }
    });

    it("inventories at least 150 distinct chrome strings", () => {
        const keys = listStringKeys();
        expect(keys.length).toBeGreaterThanOrEqual(150);
        // Sanity: no duplicates.
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("leaves few enough Arabic strings unstranslated (TODO budget)", () => {
        // Heuristic: counts strings where ar === en. A handful of
        // genuinely identical labels ("SEO", "404") are excluded by the
        // helper. Bumping this number means we shipped untranslated
        // strings — please translate, don't relax the budget.
        const n = countUntranslated("ar");
        expect(n).toBeLessThanOrEqual(5);
    });

    it("leaves few enough Kurdish strings untranslated (TODO budget)", () => {
        const n = countUntranslated("ku");
        expect(n).toBeLessThanOrEqual(5);
    });
});
