import { describe, expect, it } from "vitest";
import { acquisitionMultiple, firstAdOrder } from "./customer-acquisition";

const o = (created_at: string, ad_channel: string | null, extra: object = {}) => ({ created_at, ad_channel, attribution: null, ...extra });

describe("firstAdOrder", () => {
    it("picks the earliest order with an ad link, whatever the list order", () => {
        const late = o("2026-10-20T10:00:00Z", "facebook");
        const early = o("2026-10-01T10:00:00Z", "instagram");
        expect(firstAdOrder([late, o("2026-09-01T10:00:00Z", null), early])).toBe(early);
    });
    it("ignores returns and replacements", () => {
        const real = o("2026-10-05T10:00:00Z", "facebook");
        expect(firstAdOrder([o("2026-10-01T10:00:00Z", "facebook", { is_return: true }), o("2026-10-02T10:00:00Z", "facebook", { is_replacement: true }), real])).toBe(real);
    });
    it("is null when no order came through an ad", () => {
        expect(firstAdOrder([o("2026-10-01T10:00:00Z", null)])).toBeNull();
        expect(firstAdOrder([])).toBeNull();
    });
});

describe("acquisitionMultiple", () => {
    it("divides lifetime value by cost, one decimal", () => {
        expect(acquisitionMultiple(150000, 20000)).toBe(7.5);
    });
    it("is null without a usable cost", () => {
        expect(acquisitionMultiple(150000, null)).toBeNull();
        expect(acquisitionMultiple(150000, 0)).toBeNull();
    });
});
