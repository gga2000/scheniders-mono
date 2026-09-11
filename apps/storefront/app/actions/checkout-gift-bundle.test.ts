import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computeBundleDiscounts } from "@scheniders/shared";

// =====================================================================
// A line the server added is not evidence the shopper earned something.
// =====================================================================
// The checkout appends the free gift to the verified lines as a zero-price
// item. The bundle engine only asks whether a bundle's products are all
// present, so a merchant bundle naming the gift product completed itself the
// moment the gift was granted — paying out a discount the shopper never
// earned, funded by the merchant, and invisible to the storefront, which
// cannot know the gift is coming and therefore displays no such saving.
// =====================================================================

const SOURCE = fs.readFileSync(
    path.resolve(__dirname, "./checkout.ts"),
    "utf8",
);

describe("the hazard is real", () => {
    const bundles = [
        { id: "b1", product_ids: ["paid", "gift"], kind: "percent" as const, value: 20 },
    ];

    it("a zero-price gift line completes a bundle on its own", () => {
        const withGift = [
            { product_id: "paid", price: 10000, quantity: 1 },
            { product_id: "gift", price: 0, quantity: 1 },
        ];
        // 20% of the paid line — a real payout, triggered by a line the
        // shopper never chose.
        expect(computeBundleDiscounts(withGift, bundles).total_amount_iqd).toBe(2000);
    });

    it("and does not when the gift is left out", () => {
        const paidOnly = [{ product_id: "paid", price: 10000, quantity: 1 }];
        expect(computeBundleDiscounts(paidOnly, bundles).total_amount_iqd).toBe(0);
    });

    it("a fixed-amount bundle pays out in full, capped only by the paid line", () => {
        const fixed = [
            { id: "b2", product_ids: ["paid", "gift"], kind: "fixed" as const, value: 7500 },
        ];
        const withGift = [
            { product_id: "paid", price: 10000, quantity: 1 },
            { product_id: "gift", price: 0, quantity: 1 },
        ];
        expect(computeBundleDiscounts(withGift, fixed).total_amount_iqd).toBe(7500);
    });
});

describe("the checkout keeps the two sets apart", () => {
    it("snapshots the paid lines before appending anything of its own", () => {
        expect(SOURCE).toContain("const paidItems = [...verifiedItems]");
        // The snapshot has to be taken before the gift block, or it is not a
        // snapshot of what the shopper bought.
        expect(SOURCE.indexOf("const paidItems")).toBeLessThan(
            SOURCE.indexOf("const freeGiftCfg"),
        );
    });

    it("asks the bundle engine about the paid lines only", () => {
        const call = SOURCE.slice(
            SOURCE.indexOf("computeBundleDiscounts("),
            SOURCE.indexOf("computeBundleDiscounts(") + 600,
        );
        expect(call).toContain("paidItems,");
        expect(call).not.toMatch(/computeBundleDiscounts\(\s*verifiedItems/);
    });

    it("still records the gift as a line on the order itself", () => {
        // The gift must reach the order — it is a real thing being delivered.
        // Only the engines that decide what was *earned* exclude it.
        expect(SOURCE).toMatch(/items:\s*verifiedItems\.map/);
    });
});
