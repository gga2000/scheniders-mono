import { describe, it, expect } from "vitest";
import {
    isRealizedRevenue,
    realizedRevenueBetween,
    formatChartWeekday,
    formatChartDayMonth,
    baghdadDayStart,
    baghdadHour,
    baghdadDayOfWeek,
    parseUtcNaiveTimestamp,
    ordersDrillQuery,
    daysOrderWindow,
    periodOrderWindow,
    trendWindowStart,
    calculateRevenueTrend,
    type RealizableOrder,
} from "./dashboard-calculations";
import { orderInDateWindow, windowFromDateFilter } from "@/lib/order-window";

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

describe("periodOrderWindow — the days get_dashboard_metrics(p_range) and the Orders list count", () => {
    // 2026-10-13 09:30 Baghdad (06:30Z).
    const now = new Date("2026-10-13T06:30:00.000Z");
    const startOf = (range: "today" | "7d" | "30d", at: Date = now) =>
        new Date(periodOrderWindow(range, at)?.fromInstant ?? NaN).toISOString();

    it("today is the Baghdad calendar day, not the browser's", () => {
        expect(startOf("today")).toBe("2026-10-12T21:00:00.000Z");
        expect(periodOrderWindow("today", now)).toMatchObject({ fromDay: "2026-10-13", toDay: "2026-10-13" });
    });

    it("at 00:30 Baghdad, today has just begun — it is not still yesterday", () => {
        // 21:30Z on the 12th is 00:30 on the 13th in Baghdad.
        expect(startOf("today", new Date("2026-10-12T21:30:00.000Z"))).toBe("2026-10-12T21:00:00.000Z");
    });

    it("at 23:30 Baghdad, today is still the same Baghdad day", () => {
        // 20:30Z on the 13th is 23:30 on the 13th in Baghdad.
        expect(startOf("today", new Date("2026-10-13T20:30:00.000Z"))).toBe("2026-10-12T21:00:00.000Z");
    });

    it("7d and 30d are 7 and 30 Baghdad calendar days, today included, as the SQL and the Orders picker count them", () => {
        // 7 Oct 00:00 Baghdad through the 13th: 7 days.
        expect(startOf("7d")).toBe("2026-10-06T21:00:00.000Z");
        expect(periodOrderWindow("7d", now)).toMatchObject({ fromDay: "2026-10-07", toDay: "2026-10-13" });
        // 14 Sep 00:00 Baghdad: 30 days.
        expect(startOf("30d")).toBe("2026-09-13T21:00:00.000Z");
        // The same window the Orders date filter builds for those days.
        expect(periodOrderWindow("7d", now)).toEqual(windowFromDateFilter("2026-10-07", "2026-10-13"));
    });

    it("an order scheduled for one of the days belongs to them, as it does in the Orders list (16 Nov: 7 against 9)", () => {
        const week = daysOrderWindow(7, now);
        const scheduledIn = { created_at: "2026-10-01T10:00:00.000Z", scheduled_date: "2026-10-10" };
        const scheduledAfter = { created_at: "2026-10-01T10:00:00.000Z", scheduled_date: "2026-10-14" };
        const arrivedBefore = { created_at: "2026-10-06T20:59:59.000Z", scheduled_date: null };
        expect(orderInDateWindow(scheduledIn, week)).toBe(true);
        expect(orderInDateWindow(scheduledAfter, week)).toBe(false);
        expect(orderInDateWindow(arrivedBefore, week)).toBe(false);
    });

    it("compares each period with the same stretch of time one period earlier", () => {
        const week = daysOrderWindow(7, now, 1);
        expect(new Date(week.fromInstant).toISOString()).toBe("2026-09-29T21:00:00.000Z");
        // Up to 09:30 on the 6th, not the end of that day: six days and nine and a
        // half hours against six days and nine and a half hours.
        expect(new Date(week.toInstant + 1).toISOString()).toBe("2026-10-06T06:30:00.000Z");
        expect(week).toMatchObject({ fromDay: "2026-09-30", toDay: "2026-10-06" });
        const today = daysOrderWindow(1, now, 1);
        expect(new Date(today.fromInstant).toISOString()).toBe("2026-10-11T21:00:00.000Z");
        expect(new Date(today.toInstant + 1).toISOString()).toBe("2026-10-12T06:30:00.000Z");
    });

    it("all has no window", () => {
        expect(periodOrderWindow("all", now)).toBeNull();
    });
});

describe("ordersDrillQuery — a pipeline stage opens Orders on the days it counted", () => {
    // 00:30 on 13 Oct in Baghdad is still the 12th in UTC: the days are Baghdad's.
    const justAfterMidnight = new Date("2026-10-12T21:30:00.000Z");

    it("names the period's Baghdad days and the picker preset", () => {
        expect(ordersDrillQuery("completed", "30d", justAfterMidnight))
            .toBe("status=completed&from=2026-09-14&to=2026-10-13&preset=last30");
        expect(ordersDrillQuery("delivered", "7d", justAfterMidnight))
            .toBe("status=delivered&from=2026-10-07&to=2026-10-13&preset=last7");
        expect(ordersDrillQuery("new", "today", justAfterMidnight))
            .toBe("status=new&from=2026-10-13&to=2026-10-13&preset=today");
    });

    it("opens every day for all", () => {
        expect(ordersDrillQuery("completed", "all", justAfterMidnight)).toBe("status=completed&dates=all");
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

    it("given the period, an order that belongs to it only by its scheduled day is counted on that day, once", () => {
        const week = daysOrderWindow(7, now);
        const orders = [
            // arrived 1 Oct, scheduled for the 10th: the 10th's bar, as in the Orders list
            order({ status: "in_transit", created_at: "2026-10-01T09:00:00Z", scheduled_date: "2026-10-10" }),
            // arrived the 8th, scheduled for the 11th: still the 8th's bar, never both
            order({ status: "confirmed", created_at: "2026-10-08T09:00:00Z", scheduled_date: "2026-10-11" }),
            // scheduled for tomorrow: not in the period yet
            order({ status: "confirmed", created_at: "2026-10-01T09:00:00Z", scheduled_date: "2026-10-14" }),
        ];
        const points = calculateRevenueTrend(orders, 7, "en", now, week);
        // 7 Oct … 13 Oct: the 8th is index 1, the 10th index 3.
        expect(points.map(p => p.orders)).toEqual([0, 1, 0, 1, 0, 0, 0]);
        expect(points.reduce((n, p) => n + p.orders, 0)).toBe(orders.filter(o => orderInDateWindow(o, week)).length);
        // Without the period, bars stay by arrival.
        expect(calculateRevenueTrend(orders, 7, "en", now).map(p => p.orders)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    });

    it("a viewer sent no prices sees revenue 0, never NaN", () => {
        const points = calculateRevenueTrend([
            order({ status: "delivered", price: undefined, created_at: "2026-10-13T05:00:00Z", delivered_at: "2026-10-13T05:30:00+00:00" }),
        ], 7, "en", now);
        expect(points[6].revenue).toBe(0);
    });
});

describe("isRealizedRevenue leaves test orders out, as the orders bar does", () => {
    it("a delivered test order is not revenue", () => {
        const base = { status: "delivered", price: 15000, created_at: "2026-11-01T09:00:00Z" };
        expect(isRealizedRevenue(base)).toBe(true);
        expect(isRealizedRevenue({ ...base, is_test: true })).toBe(false);
    });
});
