import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { filterOrders } from "./filter-orders";
import type { Order } from "@/types/order";

const row = (id: string, status: Order["status"], created_at: string): Order =>
    ({ id, order_id: id, status, created_at, is_return: false, is_replacement: false }) as Order;

describe("in-transit tab and the date filter", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // Baghdad is UTC+3: 2026-11-05 09:00 UTC is 12:00 on the 5th.
    const rows = () => [
        row("today-transit", "in_transit", "2026-11-05T05:00:00Z"),
        row("old-transit", "in_transit", "2026-10-20T05:00:00Z"),
        row("today-new", "new", "2026-11-05T06:00:00Z"),
        row("old-new", "new", "2026-10-20T06:00:00Z"),
    ];
    const f = { status: "in_transit" as const, dateFrom: "2026-11-05", dateTo: "2026-11-05" };

    it("applies the date filter by default", () => {
        vi.setSystemTime(new Date("2026-11-05T09:00:00Z"));
        expect(filterOrders(rows(), f).map((o) => o.id)).toEqual(["today-transit"]);
    });

    it("shows every in-transit order when the scope is any, but still only in-transit ones", () => {
        vi.setSystemTime(new Date("2026-11-05T09:00:00Z"));
        expect(filterOrders(rows(), f, { inTransit: "any" }).map((o) => o.id)).toEqual(["today-transit", "old-transit"]);
    });

    it("shows only today's in-transit orders when the scope is today, whatever range is picked", () => {
        vi.setSystemTime(new Date("2026-11-05T09:00:00Z"));
        const wide = { ...f, dateFrom: "2026-10-01" };
        expect(filterOrders(rows(), wide, { inTransit: "today" }).map((o) => o.id)).toEqual(["today-transit"]);
    });

    it("leaves other tabs on the date filter", () => {
        vi.setSystemTime(new Date("2026-11-05T09:00:00Z"));
        expect(filterOrders(rows(), { ...f, status: "new" }, { inTransit: "any" }).map((o) => o.id)).toEqual(["today-new"]);
    });
});
