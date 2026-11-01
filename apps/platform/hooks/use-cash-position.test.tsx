import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order } from "@/types/order";
import { useCashPosition } from "./use-cash-position";

// 2026-10-31 12:00 Baghdad.
const NOW = new Date("2026-10-31T09:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const order = (over: Partial<Order>): Order =>
    ({ id: "o", order_id: "SCH-1", status: "in_transit", price: 10000, items: [], created_at: ago(40), updated_at: ago(1), ...over }) as Order;

const run = (orders: Order[]) => renderHook(() => useCashPosition(orders)).result.current;

describe("useCashPosition", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("buckets in-transit orders by days since the status last changed", () => {
        const result = run([
            order({ id: "d3", updated_at: ago(3) }),
            order({ id: "d4", updated_at: ago(4) }),
            order({ id: "d7", updated_at: ago(7) }),
            order({ id: "d8", updated_at: ago(8) }),
            order({ id: "d14", updated_at: ago(14) }),
            order({ id: "d15", updated_at: ago(15) }),
        ]);
        const count = Object.fromEntries(result.aging.map((b) => [b.id, b.count]));
        expect(count).toEqual({ fresh: 1, aging: 2, stale: 2, stuck: 1 });
        expect(result.inTransitCount).toBe(6);
        expect(result.cashInTransit).toBe(60000);
    });

    it("lists only stale and stuck orders, oldest first, and counts only 15+ days as cash at risk", () => {
        const result = run([
            order({ id: "d8", price: 1000, updated_at: ago(8) }),
            order({ id: "d20", price: 5000, updated_at: ago(20) }),
            order({ id: "d2", price: 9000, updated_at: ago(2) }),
        ]);
        expect(result.stuckOrders.map((o) => o.id)).toEqual(["d20", "d8"]);
        expect(result.oldestStuckDays).toBe(20);
        expect(result.cashAtRisk).toBe(5000);
        expect(result.stuckCount).toBe(1);
    });

    it("collects delivered and completed alike, and holds confirmed back as not shipped", () => {
        const result = run([
            order({ id: "a", status: "delivered", price: 4000, delivered_at: ago(2) }),
            order({ id: "b", status: "completed", price: 6000, delivered_at: ago(3) }),
            order({ id: "c", status: "confirmed", price: 7000 }),
        ]);
        expect(result.cashCollected).toBe(10000);
        expect(result.cashConfirmed).toBe(7000);
        expect(result.confirmedCount).toBe(1);
    });

    it("projects in-transit cash at the historical delivery rate (delivered / delivered + rejected + no response)", () => {
        const result = run([
            order({ id: "d1", status: "delivered", price: 10000, delivered_at: ago(2) }),
            order({ id: "d2", status: "completed", price: 10000, delivered_at: ago(2) }),
            order({ id: "d3", status: "completed", price: 10000, delivered_at: ago(2) }),
            order({ id: "r", status: "rejected", price: 10000 }),
            order({ id: "t", status: "in_transit", price: 8000, updated_at: ago(1) }),
        ]);
        expect(result.historicalDeliveryRate).toBe(75);
        expect(result.netProjection).toBe(30000 + 8000 * 0.75);
    });

    it("leaves refund and return rows out of every figure: they are money going back, not sales in flight", () => {
        const result = run([
            order({ id: "sale", status: "in_transit", price: 10000, updated_at: ago(1) }),
            order({ id: "ret-transit", status: "in_transit", is_return: true, price: -44750, updated_at: ago(20) }),
            order({ id: "ret-rejected", status: "rejected", is_return: true, price: 36750 }),
            order({ id: "ret-confirmed", status: "confirmed", is_return: true, price: -1000 }),
        ]);
        expect(result.cashInTransit).toBe(10000);
        expect(result.inTransitCount).toBe(1);
        expect(result.stuckOrders).toEqual([]);
        expect(result.cashConfirmed).toBe(0);
        expect(result.confirmedCount).toBe(0);
        // The rejected return must not read as a failed delivery.
        expect(result.historicalDeliveryRate).toBe(0);
        expect(result.byGovernorate).toEqual([]);
    });

    it("files daily cash on the Baghdad day it landed and spans the last 30 days", () => {
        // 00:30 Baghdad on 30 Oct is 21:30 UTC on 29 Oct.
        const result = run([order({ id: "late", status: "completed", price: 5000, delivered_at: "2026-10-29T21:30:00.000Z" })]);
        expect(result.cashSeries).toHaveLength(30);
        expect(result.cashSeries.at(-1)?.date).toBe("2026-10-31");
        const day = result.cashSeries.find((s) => s.date === "2026-10-30");
        expect(day?.collected).toBe(5000);
        expect(result.cashSeries.find((s) => s.date === "2026-10-29")?.collected).toBe(0);
    });

    it("ages an in-transit order from its status history, not from a later edit", () => {
        // Edited yesterday (updated_at), but it entered transit 20 days ago.
        const edited = order({ id: "e", updated_at: ago(1) });
        const plain = order({ id: "p", updated_at: ago(2) });
        const since = new Map([["e", ago(20)]]);
        const result = renderHook(() => useCashPosition([edited, plain], since)).result.current;
        expect(result.stuckOrders.map((o) => [o.id, o.days_in_transit])).toEqual([["e", 20]]);
        // No history row for "p": falls back to updated_at (2 days = fresh).
        expect(result.aging.find((b) => b.id === "fresh")?.count).toBe(1);
    });
});
