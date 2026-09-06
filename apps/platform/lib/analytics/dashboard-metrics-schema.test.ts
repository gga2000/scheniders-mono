import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { dashboardMetricsSchema } from "./dashboard-metrics-schema";

/**
 * ARCH-D3. The fixture mirrors the shape of a real `get_dashboard_metrics`
 * response captured from the live database on 2026-09-07 — including the extra
 * item keys the RPC passes through (sku, image_url, tag_color, product_id,
 * is_open_box) and the null-valued money/rate fields.
 *
 * Values are synthetic on purpose: the real payload carries customer names, and
 * production PII does not belong in a test fixture.
 */
const livePayloadShape = (): z.input<typeof dashboardMetricsSchema> => ({
    urgency: {
        failedDeliveries: 0, unconfirmedHighValue: 0, stuckInTransit: 42,
        highReturnCities: [{ city: "City A", rate: 40 }],
        cityRejectionStats: { "City A": { rate: 40, total: 5, rejected: 2 } },
    },
    funnel: [{ id: "1", fill: "#E4C1F9", label: "All Orders", value: 4638 }],
    leaderboard: {
        topCities: [{ id: "City A", rank: 1, label: "City A", trend: 0, value: 1605 }],
        topProducts: [{ id: "P1", rank: 1, label: "P1", trend: 0, value: 2091 }],
    },
    todayStrip: {
        ordersToday: 7, ordersYesterday: 29, ordersDelta: -22, ordersDeltaPct: -76,
        revenueToday: 239000, revenueYesterday: 0, revenueDelta: 239000, revenueDeltaPct: null,
    },
    pipeline: [{
        status: "new", label: "New", count: 0,
        color: "var(--pastel-yellow)", textColor: "#78350f", bgClass: "pastel-card-yellow",
    }],
    ordersPerHour: [{ hour: 0, count: 4, label: "12AM" }],
    peakHeatmap: [{ hour: 0, count: 39, dayOfWeek: 0, intensity: 0.348 }],
    deliveryRate: {
        trend: null, currentRate: null,
        sparkline: [{ day: "Tue", rate: null }, { day: "Wed", rate: 80 }],
    },
    avgTimePerStage: [{ label: "New -> Delivered (full cycle)", avgHours: 253.5, sampleSize: 1858 }],
    weekOverWeek: [
        { delta: 34, label: "Orders", current: 36, deltaPct: 1700, previous: 2, isFinancial: false },
        { unit: "%", delta: null, label: "Delivery Rate", current: null, deltaPct: null, previous: null, isFinancial: false },
        { delta: 204250, label: "Revenue", current: 239000, deltaPct: 588, previous: 34750, isFinancial: true },
    ],
    monthForecast: {
        daysElapsed: 7, daysInMonth: 30, ordersPerDay: 5.14,
        ordersThisMonth: 36, projectedOrders: 154,
        projectedRevenue: 1024286, revenueThisMonth: 239000,
    },
    enhancedLeaderboard: {
        topCities: [{ id: "City A", rank: 1, label: "City A", trend: 0, value: 1605 }],
        topProducts: [{ id: "P1", rank: 1, label: "P1", trend: 0, value: 2091 }],
        topProductsEnhanced: [{ id: "P1", rank: 1, label: "P1", trend: 0, value: 2091, revenue: 73721144.2 }],
    },
    staffLeaderboard: [{ name: "Staff A", rank: 1, ordersToday: 1, ordersThisWeek: 2 }],
    recentOrders: [{
        id: "0e063098-7491-41eb-b4e1-d8f30821d3c3",
        city: "City A",
        items: [{
            name: "Product A", price: 44750, quantity: 1,
            // extra keys the RPC passes straight through from the items jsonb
            sku: "SKU-A", image_url: "https://example.test/a.webp",
            tag_color: "#f97316", product_id: "eebd1ed9-cbf7-4296-9470-c52fa66e5252",
            is_open_box: false,
        }],
        price: 44750, status: "confirmed",
        created_at: "2026-09-07T23:46:00+00:00",
        customer_name: "Customer A",
    }],
});

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
