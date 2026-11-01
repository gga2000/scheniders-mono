import { describe, expect, it } from "vitest";
import type { Order } from "@/types/order";
import { buildForecast, coverDays, daysBetween } from "./forecast";

const NOW = Date.parse("2026-10-31T12:00:00.000Z"); // 15:00 Baghdad, 31 Oct

const delivered = (id: string, price: number, deliveredAt: string, over: Partial<Order> = {}): Order =>
    ({ id, status: "delivered", is_return: false, price, created_at: "2026-09-01T09:00:00.000Z", delivered_at: deliveredAt, ...over }) as Order;

describe("buildForecast", () => {
    it("dates revenue by the day it was delivered, not the day it was placed", () => {
        // Placed in early September, delivered 30 Oct.
        const f = buildForecast([delivered("a", 90_000, "2026-10-30T10:00:00.000Z")], NOW);
        const point = f.chart.find((p) => p.day === "2026-10-30");
        expect(point?.historical).toBe(90_000);
        expect(f.chart.find((p) => p.day === "2026-09-01")?.historical).toBe(0);
    });

    it("files a delivery just after Baghdad midnight under the Baghdad day", () => {
        // 21:30 UTC on 29 Oct is 00:30 Baghdad on 30 Oct.
        const f = buildForecast([delivered("a", 10_000, "2026-10-29T21:30:00.000Z")], NOW);
        expect(f.chart.find((p) => p.day === "2026-10-30")?.historical).toBe(10_000);
        expect(f.chart.find((p) => p.day === "2026-10-29")?.historical).toBe(0);
    });

    it("ignores returns, undelivered orders and orders with no delivery date", () => {
        const f = buildForecast([
            delivered("ret", 5_000, "2026-10-30T10:00:00.000Z", { is_return: true }),
            delivered("transit", 5_000, "2026-10-30T10:00:00.000Z", { status: "in_transit" }),
            delivered("nodate", 5_000, "", { delivered_at: undefined }),
        ], NOW);
        expect(f.chart.filter((p) => p.historical !== null).every((p) => p.historical === 0)).toBe(true);
    });

    it("projects 90 days after today and keeps best above likely above worst", () => {
        const orders = Array.from({ length: 30 }, (_, i) => delivered(`o${i}`, 100_000, `2026-10-${String(1 + i).padStart(2, "0")}T10:00:00.000Z`));
        const f = buildForecast(orders, NOW);
        const projected = f.chart.filter((p) => p.likely !== null);
        expect(projected).toHaveLength(90);
        expect(projected[0].day).toBe("2026-11-01");
        expect(projected[89].day).toBe("2027-01-29");
        expect(f.d30.best).toBeGreaterThan(f.d30.likely);
        expect(f.d30.likely).toBeGreaterThan(f.d30.worst);
        expect(f.d90.likely).toBe(projected.reduce((s, p) => s + (p.likely ?? 0), 0));
    });

    it("clamps a collapse in momentum to -50%", () => {
        // Strong first month, nothing in the last 14 days.
        const orders = Array.from({ length: 16 }, (_, i) => delivered(`o${i}`, 100_000, `2026-10-${String(1 + i).padStart(2, "0")}T10:00:00.000Z`));
        const f = buildForecast(orders, NOW);
        expect(f.rawMomentum).toBeLessThan(-0.5);
        expect(f.momentum).toBe(-0.5);
        expect(f.momentumClamped).toBe(true);
    });

    it("has a zero baseline and no momentum with no orders", () => {
        const f = buildForecast([], NOW);
        expect(f.baseline).toBe(0);
        expect(f.momentum).toBe(0);
        expect(f.d90.likely).toBe(0);
    });
});

describe("coverDays", () => {
    it("divides the period's expenses by the period's own length", () => {
        expect(coverDays(700_000, 700_000, 7)).toEqual({ dailyBurn: 100_000, days: 7 });
        expect(coverDays(700_000, 700_000, 70)).toEqual({ dailyBurn: 10_000, days: 70 });
    });

    it("is unbounded when nothing is spent", () => {
        expect(coverDays(500_000, 0, 30).days).toBe(Infinity);
    });
});

describe("daysBetween", () => {
    it("counts both end days", () => {
        expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31);
        expect(daysBetween("2026-10-05", "2026-10-05")).toBe(1);
    });
});
