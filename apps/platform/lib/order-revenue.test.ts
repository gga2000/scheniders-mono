import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import {
    REALIZED_REVENUE_STATUSES,
    isRealizedRevenue,
    isSaleOrder,
    realizedAt,
    baghdadDayKey,
    sumRealizedRevenue,
    sumRealizedRevenueForDay,
    countRealizedForDay,
    recentBaghdadDayKeys,
} from "./order-revenue";

function order(partial: Partial<Order>): Order {
    return {
        id: "id",
        created_at: "2026-09-01T00:00:00.000Z",
        order_id: "1",
        customer_name: "x",
        phone: "07700000000",
        city: "بغداد",
        items: [],
        price: 1000,
        status: "delivered",
        is_return: false,
        ...partial,
    } as Order;
}

describe("isRealizedRevenue", () => {
    it("counts delivered and completed", () => {
        expect(isRealizedRevenue(order({ status: "delivered" }))).toBe(true);
        expect(isRealizedRevenue(order({ status: "completed" }))).toBe(true);
    });

    it("does not count pipeline statuses as money", () => {
        for (const status of ["new", "contacted", "confirmed", "in_transit"] as const) {
            expect(isRealizedRevenue(order({ status })), status).toBe(false);
        }
    });

    it("does not count returns", () => {
        expect(isRealizedRevenue(order({ status: "delivered", is_return: true }))).toBe(false);
    });

    it("exposes one status set, so stats and profits cannot drift", () => {
        expect([...REALIZED_REVENUE_STATUSES].sort()).toEqual(["completed", "delivered"]);
    });
});

describe("baghdadDayKey", () => {
    it("uses the Baghdad day, not UTC", () => {
        // 22:30 UTC is already the next day in Baghdad (UTC+3).
        expect(baghdadDayKey("2026-09-07T22:30:00.000Z")).toBe("2026-09-08");
        // 20:59 UTC is still the same Baghdad day.
        expect(baghdadDayKey("2026-09-07T20:59:00.000Z")).toBe("2026-09-07");
    });

    it("handles the exact Baghdad midnight boundary", () => {
        expect(baghdadDayKey("2026-09-07T21:00:00.000Z")).toBe("2026-09-08");
        expect(baghdadDayKey("2026-09-07T20:59:59.999Z")).toBe("2026-09-07");
    });

    it("returns null for an unparseable instant", () => {
        expect(baghdadDayKey("not-a-date")).toBeNull();
    });
});

describe("realizedAt", () => {
    it("prefers the delivery moment", () => {
        expect(
            realizedAt(order({
                delivered_at: "2026-09-07T10:00:00.000Z",
                completed_at: "2026-09-09T10:00:00.000Z",
            })),
        ).toBe("2026-09-07T10:00:00.000Z");
    });

    it("falls back to completion when delivery was never recorded", () => {
        expect(realizedAt(order({ delivered_at: undefined, completed_at: "2026-09-09T10:00:00.000Z" })))
            .toBe("2026-09-09T10:00:00.000Z");
    });

    it("is null when neither exists", () => {
        expect(realizedAt(order({ delivered_at: undefined, completed_at: undefined }))).toBeNull();
    });
});

describe("sumRealizedRevenueForDay", () => {
    it("buckets on the day earned, not the day created — the COR-4 bug", () => {
        const orders = [
            // Created the 6th, delivered the 7th. Belongs to the 7th.
            order({
                id: "a",
                price: 25000,
                created_at: "2026-09-06T08:00:00.000Z",
                delivered_at: "2026-09-07T12:00:00.000Z",
            }),
            // Created and delivered the 6th.
            order({
                id: "b",
                price: 10000,
                created_at: "2026-09-06T09:00:00.000Z",
                delivered_at: "2026-09-06T15:00:00.000Z",
            }),
        ];

        expect(sumRealizedRevenueForDay(orders, "2026-09-07")).toBe(25000);
        expect(sumRealizedRevenueForDay(orders, "2026-09-06")).toBe(10000);
        expect(countRealizedForDay(orders, "2026-09-07")).toBe(1);
    });

    it("includes completed orders, which the old stats dropped", () => {
        const orders = [
            order({ id: "a", status: "completed", price: 5000, delivered_at: "2026-09-07T12:00:00.000Z" }),
        ];
        expect(sumRealizedRevenueForDay(orders, "2026-09-07")).toBe(5000);
    });

    it("excludes a confirmed order, which revenueTrends used to count", () => {
        const orders = [
            order({ id: "a", status: "confirmed", price: 9999, delivered_at: "2026-09-07T12:00:00.000Z" }),
        ];
        expect(sumRealizedRevenueForDay(orders, "2026-09-07")).toBe(0);
    });

    it("attributes nothing to a day when the realized instant is missing", () => {
        const orders = [
            order({ id: "a", price: 7000, delivered_at: undefined, completed_at: undefined }),
        ];
        expect(sumRealizedRevenueForDay(orders, "2026-09-07")).toBe(0);
        // …but it still counts in the overall total.
        expect(sumRealizedRevenue(orders)).toBe(7000);
    });

    it("respects the Baghdad boundary when bucketing", () => {
        const orders = [
            order({ id: "a", price: 1000, delivered_at: "2026-09-07T21:30:00.000Z" }),
        ];
        // 21:30 UTC is 00:30 on the 8th in Baghdad.
        expect(sumRealizedRevenueForDay(orders, "2026-09-08")).toBe(1000);
        expect(sumRealizedRevenueForDay(orders, "2026-09-07")).toBe(0);
    });
});

describe("recentBaghdadDayKeys", () => {
    it("returns the window oldest first, ending today", () => {
        const keys = recentBaghdadDayKeys(3, new Date("2026-09-07T12:00:00.000Z"));
        expect(keys).toEqual(["2026-09-05", "2026-09-06", "2026-09-07"]);
    });
});

describe("isSaleOrder", () => {
    const sale = (status: Order["status"], is_return = false) => ({ status, is_return });

    it("counts active and fulfilled orders", () => {
        for (const s of ["new", "confirmed", "in_transit", "delivered", "completed", "suspended"] as const) {
            expect(isSaleOrder(sale(s))).toBe(true);
        }
    });

    it("excludes orders that never became a sale", () => {
        for (const s of ["rejected", "cancelled", "no_response", "pending_checkout"] as const) {
            expect(isSaleOrder(sale(s))).toBe(false);
        }
    });

    it("excludes refund and return rows", () => {
        expect(isSaleOrder(sale("refund_delivered"))).toBe(false);
        expect(isSaleOrder(sale("return_pending"))).toBe(false);
        expect(isSaleOrder(sale("completed", true))).toBe(false);
    });
});
