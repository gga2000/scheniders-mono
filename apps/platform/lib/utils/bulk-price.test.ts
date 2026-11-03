import { describe, expect, it } from "vitest";
import { clearsCompareAt } from "./bulk-price";

describe("clearsCompareAt", () => {
    it("clears a was-price at or below the new price", () => {
        expect(clearsCompareAt({ compare_at_price: 20000 }, 20000, false)).toBe(true);
        expect(clearsCompareAt({ compare_at_price: 25000 }, 20000, false)).toBe(false);
    });

    it("compares against the kept website price when the website keeps its own", () => {
        // New price 20,000 but the website still charges 30,000: a 25,000 was-price is now fake.
        expect(clearsCompareAt({ compare_at_price: 25000, website_price: 30000 }, 20000, false)).toBe(true);
        // A was-price above the kept website price stays.
        expect(clearsCompareAt({ compare_at_price: 35000, website_price: 30000 }, 40000, false)).toBe(false);
    });

    it("compares against the new price when the website price is replaced too", () => {
        expect(clearsCompareAt({ compare_at_price: 25000, website_price: 30000 }, 20000, true)).toBe(false);
    });

    it("never clears what is not there", () => {
        expect(clearsCompareAt({ compare_at_price: null }, 1, false)).toBe(false);
    });
});
