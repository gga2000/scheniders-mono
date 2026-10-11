import { describe, it, expect } from "vitest";
import { canShipWithoutSelection, canOfferSelectAll, partitionByShipDay } from "./order-bulk-scope";

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

describe("partitionByShipDay", () => {
    // 00:30 Baghdad on 8 Oct 2026 — still the 7th in UTC.
    const now = Date.parse("2026-10-07T21:30:00.000Z");
    const orders = [
        { id: "unscheduled", scheduled_date: null },
        { id: "due-today", scheduled_date: "2026-10-08" },
        { id: "overdue", scheduled_date: "2026-10-05" },
        { id: "tomorrow", scheduled_date: "2026-10-09" },
    ];

    it("holds back only orders scheduled for a later Baghdad day", () => {
        const { shippable, scheduledLater } = partitionByShipDay(orders, now);
        expect(shippable.map(o => o.id)).toEqual(["unscheduled", "due-today", "overdue"]);
        expect(scheduledLater.map(o => o.id)).toEqual(["tomorrow"]);
    });

    it("treats an order due today as shippable just after Baghdad midnight", () => {
        // Under UTC-day logic the 8th would still be "tomorrow" here.
        expect(partitionByShipDay([{ scheduled_date: "2026-10-08" }], now).scheduledLater).toHaveLength(0);
    });
});
