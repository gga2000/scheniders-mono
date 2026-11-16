import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n-ar";
import { en } from "@/lib/i18n-en";

/*
 * Fermi B5 (one free trial per merchant): a shop whose trial was not given
 * because it matched an earlier store is asked kindly. Merchant-facing text
 * never accuses ("exposed", "cheating", "abuse"), and never names the other
 * store or the signal that matched.
 */
const ACCUSING_AR = /انكشفت|غش|إساءة|اساءة/;
const ACCUSING_EN = /\b(abuse|cheat|fraud|caught|exposed)\b/i;

describe("trial check wording", () => {
    it("keeps the handoff's kind sentence word for word", () => {
        expect(ar["billing.lock.titlePreviousStore"]).toBe("لگينا متجر سابق إلك ويانا. تريد نرجعلك بياناته وتكمل بالباقة؟");
    });

    it("no billing lock text accuses the merchant", () => {
        const arHits = Object.entries(ar).filter(([k, v]) => k.startsWith("billing.") && ACCUSING_AR.test(v));
        const enHits = Object.entries(en).filter(([k, v]) => k.startsWith("billing.") && ACCUSING_EN.test(v));
        expect(arHits).toEqual([]);
        expect(enHits).toEqual([]);
    });
});
