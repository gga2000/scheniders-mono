import { describe, it, expect } from "vitest";
import { translations } from "./i18n";

/**
 * One fee, one name. The amount a refund keeps for the courier's pickup trip is
 * ticked in the refund sheet and shown again on the refund order's card. Both
 * places use the sheet's words, so the merchant never sees one 5,000 under two
 * names («خصم توصيل» on the card was the second one).
 */
const NAME = { ar: "رسوم الاستلام", en: /pickup fee/i } as const;
const KEYS = ["orders.card.pickupFee", "refund.keepPickupFee", "refund.pickupFeeKept"] as const;

describe("the refund pickup fee has one name", () => {
    for (const lang of ["ar", "en"] as const) {
        it.each(KEYS)(`${lang}: %s`, (key) => {
            const text = translations[lang][key];
            expect(text).toBeDefined();
            expect(text).toMatch(NAME[lang]);
        });
    }

    it("the card no longer says «خصم توصيل»", () => {
        expect(Object.values(translations.ar)).not.toContain("خصم توصيل: {amount}");
    });
});
