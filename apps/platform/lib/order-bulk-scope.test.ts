import { describe, it, expect } from "vitest";
import { canShipWithoutSelection, canOfferSelectAll } from "./order-bulk-scope";

describe("canShipWithoutSelection", () => {
    it("allows shipping an explicit selection even from a partial list", () => {
        // The merchant named these orders, so the loaded window is irrelevant.
        expect(canShipWithoutSelection({ selectedCount: 5, ordersAreComplete: false })).toBe(true);
    });

    it("allows 'ship everything visible' when the list really is everything", () => {
        expect(canShipWithoutSelection({ selectedCount: 0, ordersAreComplete: true })).toBe(true);
    });

    it("refuses 'ship everything visible' when only part of the filter is loaded", () => {
        // The dangerous case: dispatching couriers against whichever orders
        // happened to be in the window.
        expect(canShipWithoutSelection({ selectedCount: 0, ordersAreComplete: false })).toBe(false);
    });
});

describe("canOfferSelectAll", () => {
    const base = { selectedCount: 50, loadedCount: 4663, pageSelectLimit: 50 };

    it("offers select-all when the loaded list is the whole filter", () => {
        expect(canOfferSelectAll({ ...base, ordersAreComplete: true })).toBe(true);
    });

    it("hides select-all when the list is a window, so the count cannot over-promise", () => {
        expect(canOfferSelectAll({ ...base, ordersAreComplete: false })).toBe(false);
    });

    it("stays hidden when everything loaded is already selected", () => {
        expect(canOfferSelectAll({ ...base, selectedCount: 4663, ordersAreComplete: true })).toBe(false);
    });

    it("stays hidden below the page-select limit", () => {
        expect(canOfferSelectAll({ selectedCount: 5, loadedCount: 20, pageSelectLimit: 50, ordersAreComplete: true })).toBe(false);
    });
});
