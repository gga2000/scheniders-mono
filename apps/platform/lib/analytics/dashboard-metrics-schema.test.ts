import { describe, it, expect } from "vitest";
import { dashboardMetricsSchema } from "./dashboard-metrics-schema";
import { livePayloadShape } from "./__fixtures__/dashboard-metrics";

describe("dashboard metrics contract", () => {
    it("accepts the shape the live RPC actually returns", () => {
        const result = dashboardMetricsSchema.safeParse(livePayloadShape());
        expect(result.success ? null : result.error.issues).toBeNull();
    });

    it("accepts a payload redacted for a viewer without VIEW_FINANCIALS (SEC-D2)", () => {
        const p = livePayloadShape();
        p.todayStrip.revenueToday = null;
        p.todayStrip.revenueYesterday = null;
        p.todayStrip.revenueDelta = null;
        p.monthForecast.projectedRevenue = null;
        p.monthForecast.revenueThisMonth = null;
        p.weekOverWeek[2] = { ...p.weekOverWeek[2], current: null, previous: null, delta: null };
        p.enhancedLeaderboard.topProductsEnhanced[0].revenue = null;
        p.recentOrders[0].price = null;
        expect(dashboardMetricsSchema.safeParse(p).success).toBe(true);
    });

    it("REJECTS drift — a renamed or missing key must fail loudly, not arrive as undefined", () => {
        const p = livePayloadShape() as Record<string, unknown>;
        delete p.todayStrip;
        expect(dashboardMetricsSchema.safeParse(p).success).toBe(false);
    });

    it("REJECTS a money field arriving as a string", () => {
        const p = livePayloadShape();
        (p.todayStrip as unknown as Record<string, unknown>).revenueToday = "239000";
        expect(dashboardMetricsSchema.safeParse(p).success).toBe(false);
    });
});

describe("dashboard metrics contract — values observed live on 2026-10-13", () => {
    it("accepts fractional revenue, a negative order price and the cycle-time `excluded` count", () => {
        const p = livePayloadShape();
        p.enhancedLeaderboard.topProductsEnhanced[0].revenue = 80936865.06359345;
        p.recentOrders[0].price = -31750;   // a refund row
        p.avgTimePerStage[0] = { ...p.avgTimePerStage[0], excluded: 120 };
        const result = dashboardMetricsSchema.safeParse(p);
        expect(result.success ? null : result.error.issues).toBeNull();
    });

    it("accepts the employee redaction exactly as the RPC sends it: every money field null", () => {
        const p = livePayloadShape();
        Object.assign(p.todayStrip, { revenueToday: null, revenueYesterday: null, revenueDelta: null, revenueDeltaPct: null });
        Object.assign(p.monthForecast, { projectedRevenue: null, revenueThisMonth: null });
        p.weekOverWeek[2] = { ...p.weekOverWeek[2], current: null, previous: null, delta: null, deltaPct: null };
        p.enhancedLeaderboard.topProductsEnhanced = p.enhancedLeaderboard.topProductsEnhanced.map(x => ({ ...x, revenue: null }));
        p.recentOrders = p.recentOrders.map(r => ({ ...r, price: null }));
        expect(dashboardMetricsSchema.safeParse(p).success).toBe(true);
    });
});
