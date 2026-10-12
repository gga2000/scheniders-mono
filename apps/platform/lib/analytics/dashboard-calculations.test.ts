import { describe, it, expect } from "vitest";
import {
    realizedRevenueBetween,
    formatChartWeekday,
    formatChartDayMonth,
    baghdadDayStart,
    baghdadHour,
    baghdadDayOfWeek,
    parseUtcNaiveTimestamp,
    rangeCutoff,
    trendWindowStart,
    calculateRevenueTrend,
    type RealizableOrder,
} from "./dashboard-calculations";

/**
 * The dashboard's numbers come from `get_dashboard_metrics` alone (ORD-2); its
 * formulas are pinned by the SQL migrations. What is pinned here is the client
 * code that remains: the Baghdad calendar, the range cutoffs that must agree with
 * the RPC, and the daily trend series the RPC does not return.
 */

const order = (o: Partial<RealizableOrder>): RealizableOrder => ({
    status: "delivered", price: 0, created_at: "2026-09-01T09:00:00Z", ...o,
});

describe("COR-D3 (corrected) — delivered_at arrives WITH an offset; the parser must not shift it", () => {
    it("a zoneless timestamp is read as UTC, not as browser-local", () => {
        // Defensive only: the live column is timestamptz and never arrives in
        // this form. Kept because a zoneless value would otherwise be read as
        // browser-local, which in Baghdad (UTC+3) shifts the instant.
        expect(parseUtcNaiveTimestamp("2026-09-01 22:00:00.344756").toISOString())
            .toBe("2026-09-01T22:00:00.344Z");
    });

    it("leaves a value that already carries a zone alone", () => {
        expect(parseUtcNaiveTimestamp("2026-09-01T22:00:00.000Z").toISOString())
            .toBe("2026-09-01T22:00:00.000Z");
        expect(parseUtcNaiveTimestamp("2026-09-01T22:00:00.000+00:00").toISOString())
            .toBe("2026-09-01T22:00:00.000Z");
    });
});

describe("TMP-D1 — boundaries resolve in Baghdad, not the browser's timezone", () => {
    it("THE BUG: an order at 01:00 Baghdad belongs to that Baghdad day", () => {
        // 2026-09-05 22:05Z is 2026-09-06 01:05 in Baghdad (UTC+3), so the Baghdad
        // day containing it starts at 2026-09-05T21:00Z. A browser in UTC would
        // have put it in the previous day.
        const instant = new Date("2026-09-05T22:05:00.000Z");
        expect(baghdadDayStart(instant).toISOString()).toBe("2026-09-05T21:00:00.000Z");
    });

    it("day start is the same instant regardless of where the browser is", () => {
        // Two instants inside the same Baghdad day resolve to one boundary.
        const morning = new Date("2026-09-06T05:00:00.000Z");   // 08:00 Baghdad
        const evening = new Date("2026-09-06T20:00:00.000Z");   // 23:00 Baghdad
        expect(baghdadDayStart(morning).toISOString())
            .toBe(baghdadDayStart(evening).toISOString());
    });

    it("buckets the hour and weekday in Baghdad, which can be the NEXT day", () => {
        // 22:05Z on Saturday the 5th is already 01:05 on Sunday the 6th in Baghdad.
        // Bucketing on the browser's UTC weekday put this order on the wrong day of
        // the peak-hours heatmap entirely.
        const instant = new Date("2026-09-05T22:05:00.000Z");
        expect(baghdadHour(instant)).toBe(1);
        expect(baghdadDayOfWeek(instant)).toBe(0);              // Sunday
        expect(instant.getUTCDay()).toBe(6);                    // ...but Saturday in UTC
    });
});

describe("I18N-D3 — chart axis labels follow the locale and Baghdad's day", () => {
    it("THE BUG: labels were en-US, so an Arabic UI showed English weekdays", () => {
        const d = new Date("2026-09-06T09:00:00.000Z");
        expect(formatChartWeekday(d, "en")).toBe("Sun");
        expect(formatChartWeekday(d, "ar")).not.toBe("Sun");   // renders in Arabic
    });

    it("orders the day before the month — en-US put the month first, wrong for Iraq", () => {
        const label = formatChartDayMonth(new Date("2026-09-06T09:00:00.000Z"), "en");
        expect(label).toMatch(/^6\s/);        // "6 Sep", not "Sep 6"
    });

    it("names the Baghdad day, not the viewer's", () => {
        // 22:05Z Saturday is already Sunday in Baghdad; the label must say Sunday
        // whatever timezone the browser is in.
        expect(formatChartWeekday(new Date("2026-09-05T22:05:00.000Z"), "en")).toBe("Sun");
    });
});

describe("COR-D1 — revenue is what was collected, not what was promised", () => {
    const iso = (d: string) => new Date(d).toISOString();

    it("THE BUG: a confirmed-but-undelivered order is not revenue", () => {
        const orders = [order({
            status: "confirmed", price: 34750,
            created_at: iso("2026-09-08T09:00:00Z"),
        })];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(0);
    });

    it("counts a delivered order, dated by when it was DELIVERED", () => {
        // Ordered in August, delivered in September: the money belongs to September.
        const orders = [order({
            status: "delivered", price: 50000,
            created_at: iso("2026-08-20T09:00:00Z"),
            delivered_at: "2026-09-05 10:00:00.000000",
        })];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(50000);
        // ...and not to August.
        expect(realizedRevenueBetween(
            orders, new Date("2026-08-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z"),
        )).toBe(0);
    });

    it("falls back to completed_at when there is no delivered_at", () => {
        const orders = [order({
            status: "completed", price: 12000, created_at: iso("2026-08-20T09:00:00Z"),
            completed_at: iso("2026-09-05T10:00:00Z"),
        })];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(12000);
    });

    it("excludes a realized order that carries no timestamp at all (legacy imports)", () => {
        const orders = [order({ status: "delivered", price: 9999, created_at: iso("2025-06-01T09:00:00Z") })];
        expect(realizedRevenueBetween(orders, new Date("2025-01-01T00:00:00Z"))).toBe(0);
    });
});

describe("rangeCutoff — the same window boundaries as get_dashboard_metrics(p_range)", () => {
    // 2026-10-13 09:30 Baghdad (06:30Z).
    const now = new Date("2026-10-13T06:30:00.000Z");

    it("today is the Baghdad calendar day, not the browser's", () => {
        expect(rangeCutoff("today", now)?.toISOString()).toBe("2026-10-12T21:00:00.000Z");
    });

    it("at 00:30 Baghdad, today has just begun — it is not still yesterday", () => {
        // 21:30Z on the 12th is 00:30 on the 13th in Baghdad.
        const justAfterMidnight = new Date("2026-10-12T21:30:00.000Z");
        expect(rangeCutoff("today", justAfterMidnight)?.toISOString()).toBe("2026-10-12T21:00:00.000Z");
    });

    it("at 23:30 Baghdad, today is still the same Baghdad day", () => {
        // 20:30Z on the 13th is 23:30 on the 13th in Baghdad.
        const lateEvening = new Date("2026-10-13T20:30:00.000Z");
        expect(rangeCutoff("today", lateEvening)?.toISOString()).toBe("2026-10-12T21:00:00.000Z");
    });

    it("7d and 30d are rolling windows ending now, as the SQL computes them", () => {
        expect(rangeCutoff("7d", now)?.toISOString()).toBe("2026-10-06T06:30:00.000Z");
        expect(rangeCutoff("30d", now)?.toISOString()).toBe("2026-09-13T06:30:00.000Z");
    });

    it("all has no cutoff", () => {
        expect(rangeCutoff("all", now)).toBeNull();
    });
});

describe("calculateRevenueTrend — one point per Baghdad day", () => {
    // 2026-10-13 09:30 Baghdad.
    const now = new Date("2026-10-13T06:30:00.000Z");

    it("the window starts at the Baghdad midnight days-1 days ago", () => {
        expect(trendWindowStart(7, now).toISOString()).toBe("2026-10-06T21:00:00.000Z");
        expect(trendWindowStart(30, now).toISOString()).toBe("2026-09-13T21:00:00.000Z");
    });

    it("returns exactly `days` points, oldest first, ending today", () => {
        const points = calculateRevenueTrend([], 7, "en", now);
        expect(points).toHaveLength(7);
        expect(points[6].date).toBe("Tue");   // 2026-10-13 is a Tuesday
        expect(points.every(p => p.orders === 0 && p.revenue === 0)).toBe(true);
    });

    it("an order at 01:00 Baghdad lands on that Baghdad day, not the UTC one", () => {
        // 22:00Z on the 12th = 01:00 on the 13th in Baghdad → today's bar.
        const points = calculateRevenueTrend([order({ status: "new", created_at: "2026-10-12T22:00:00.000Z" })], 7, "en", now);
        expect(points[6].orders).toBe(1);
        expect(points[5].orders).toBe(0);
    });

    it("bars count orders by creation; revenue is dated by delivery (COR-D1)", () => {
        const points = calculateRevenueTrend([
            // created before the window, delivered today: revenue today, no bar
            order({ status: "delivered", price: 50000, created_at: "2026-09-01T09:00:00Z", delivered_at: "2026-10-13T05:00:00+00:00" }),
            // created today, only confirmed: a bar, no revenue
            order({ status: "confirmed", price: 30000, created_at: "2026-10-13T05:00:00Z" }),
        ], 7, "en", now);
        expect(points[6]).toMatchObject({ orders: 1, revenue: 50000 });
        expect(points.slice(0, 6).every(p => p.orders === 0 && p.revenue === 0)).toBe(true);
    });

    it("a viewer sent no prices sees revenue 0, never NaN", () => {
        const points = calculateRevenueTrend([
            order({ status: "delivered", price: undefined, created_at: "2026-10-13T05:00:00Z", delivered_at: "2026-10-13T05:30:00+00:00" }),
        ], 7, "en", now);
        expect(points[6].revenue).toBe(0);
    });
});
