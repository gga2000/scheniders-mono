import { describe, it, expect } from "vitest";
import { translations } from "./i18n";

/**
 * One thing, one name on the Orders page (Ali, 2026-11-22).
 * - Refunds (customer paid, gets money back) are not returned parcels (the
 *   courier brings back what was not delivered). The refunds tab, chip and
 *   filter share one name, and it is not the name of the orange returns desk.
 * - The on-hold chip and bulk button read like the order's own status.
 * - The Prime fix queue keeps «معالجة»: Ali chose to keep it.
 */
describe("Orders labels: one thing, one name", () => {
    for (const lang of ["ar", "en"] as const) {
        const d = translations[lang];

        it(`${lang}: refunds tab, chip and filter share one name, apart from the returns desk`, () => {
            const refunds = d["orders.status.refunds"];
            expect(refunds).toBeDefined();
            expect(d["orders.chip.refunds"]).toBe(refunds);
            expect(d["orders.filter.refunds"]).toBe(refunds);
            expect(refunds).not.toBe(d["orders.ui.returns"]);
        });

        it(`${lang}: the on-hold chip and bulk button read like the order's status`, () => {
            const onHold = d["orders.status.suspended"];
            expect(onHold).toBeDefined();
            expect(d["orders.chip.suspended"]).toBe(onHold);
            expect(d["orders.bulk.suspended"]).toBe(onHold);
        });
    }

    it("Reports names the refunds it adds to the Orders count with the Orders chip's word (critic r18)", () => {
        // «+ 9 … = 327 في صفحة الطلبات» points the merchant at the Orders chip «الاسترجاعات 9».
        for (const form of ["", ".one", ".two", ".few", ".many"]) {
            const line = translations.ar[`reports.kpi.plusReturns${form}`];
            expect(line).toMatch(/استرجاع/);
            expect(line).not.toMatch(/مرتجع/);
        }
        expect(translations.en["reports.kpi.plusReturns"]).toMatch(/refunds/);
        expect(translations.en["reports.kpi.plusReturns.one"]).toMatch(/refund\b/);
    });

    it("ar: the words Ali picked", () => {
        expect(translations.ar["orders.chip.refunds"]).toBe("الاسترجاعات");
        expect(translations.ar["orders.chip.suspended"]).toBe("معلق");
        expect(translations.ar["orders.ui.returns"]).toBe("المرتجعات");
        expect(translations.ar["orders.primeQueue.fix.label"]).toBe("معالجة");
    });
});
