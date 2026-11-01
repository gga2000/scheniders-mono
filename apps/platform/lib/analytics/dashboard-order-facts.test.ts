import { describe, it, expect } from "vitest";
import {
    factColumns,
    factFilter,
    fetchAllPages,
    geoFactSchema,
    trendFactSchema,
} from "./dashboard-order-facts";

// 2026-10-13 09:30 Baghdad (06:30Z).
const now = new Date("2026-10-13T06:30:00.000Z");

describe("factFilter — the trend and map read exactly their window", () => {
    it("trend: created OR realized since the first plotted Baghdad midnight", () => {
        // A delivery today of an order created last month is today's revenue; a
        // created_at floor alone would drop it from the chart.
        expect(factFilter({ kind: "trend", days: 7 }, now)).toEqual({
            type: "or",
            expression:
                "created_at.gte.2026-10-06T21:00:00.000Z," +
                "delivered_at.gte.2026-10-06T21:00:00.000Z," +
                "completed_at.gte.2026-10-06T21:00:00.000Z",
        });
    });

    it("geo: the same created_at cutoff get_dashboard_metrics applies for the range", () => {
        expect(factFilter({ kind: "geo", range: "today" }, now))
            .toEqual({ type: "createdSince", since: "2026-10-12T21:00:00.000Z" });
        expect(factFilter({ kind: "geo", range: "7d" }, now))
            .toEqual({ type: "createdSince", since: "2026-10-06T06:30:00.000Z" });
        expect(factFilter({ kind: "geo", range: "all" }, now)).toEqual({ type: "none" });
    });
});

describe("factColumns — money is only requested for viewers entitled to it (SEC-D2)", () => {
    it("omits price for a viewer who may not see money", () => {
        expect(factColumns("trend", false)).not.toContain("price");
        expect(factColumns("geo", false)).not.toContain("price");
    });

    it("adds price for an entitled viewer", () => {
        expect(factColumns("trend", true).split(",")).toContain("price");
        expect(factColumns("geo", true).split(",")).toContain("price");
    });

    it("selects only what each widget reads", () => {
        expect(factColumns("trend", false)).toBe("created_at,status,delivered_at,completed_at,source,governorate_code,validated_governorate_code");
        expect(factColumns("geo", false)).toBe("status,governorate_code,validated_governorate_code");
    });
});

describe("fact row contracts", () => {
    it("accepts a live-shaped trend row without price (employee) and with numeric price (admin)", () => {
        const row = {
            created_at: "2026-10-12T22:08:07.599627+00:00", status: "in_transit",
            delivered_at: null, completed_at: null,
            source: "lightfunnels", governorate_code: "BGD", validated_governorate_code: null,
        };
        expect(trendFactSchema.parse(row)).toEqual(row);
        expect(trendFactSchema.parse({ ...row, price: 36750 }).price).toBe(36750);
    });

    it("rejects a price that arrives as a string rather than coercing it", () => {
        expect(geoFactSchema.safeParse({
            status: "delivered", governorate_code: "BGD", validated_governorate_code: null, price: "36750",
        }).success).toBe(false);
    });
});

describe("fetchAllPages — never stops at the first 1,000 rows", () => {
    it("keeps paging until a short page, and returns every row", async () => {
        const total = 2503;
        const ranges: Array<[number, number]> = [];
        const rows = await fetchAllPages(async (from, to) => {
            ranges.push([from, to]);
            const end = Math.min(to, total - 1);
            return end < from ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i);
        }, 1000);
        expect(rows).toHaveLength(total);
        expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    });

    it("an exact multiple of the page size costs one extra, empty request — not a lost page", async () => {
        let calls = 0;
        const rows = await fetchAllPages(async (from) => {
            calls++;
            return from < 2000 ? Array.from({ length: 1000 }, () => 1) : [];
        }, 1000);
        expect(rows).toHaveLength(2000);
        expect(calls).toBe(3);
    });

    it("propagates a failed page instead of returning a partial book", async () => {
        await expect(fetchAllPages(async (from) => {
            if (from > 0) throw new Error("57014 statement timeout");
            return Array.from({ length: 1000 }, () => 1);
        }, 1000)).rejects.toThrow("57014");
    });
});
