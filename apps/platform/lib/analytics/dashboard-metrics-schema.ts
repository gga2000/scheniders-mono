import { z } from "zod";

/**
 * ARCH-D3 — the runtime contract for `get_dashboard_metrics`.
 *
 * Every number on the dashboard arrived as `data as unknown as DashboardMetrics`:
 * a double cast asserting a shape nobody checked. A drift between the SQL function
 * and this type would not fail — it would land as `undefined` inside widgets and
 * render as blanks or NaN, which is exactly the "plausible wrong number" this
 * surface is most dangerous for.
 *
 * Parsing instead of asserting turns that into a loud, reported failure that falls
 * back to the local engine (which now announces itself — ENG-D1). It also makes
 * this file the written contract: the nullable money fields are SEC-D2's
 * entitlement redaction, and the nullable rates are COR-D7's "no data is not 0%".
 */

const leaderboardItem = z.object({
    id: z.string(),
    label: z.string(),
    subLabel: z.string().optional(),
    value: z.number(),
    trend: z.number(),
    rank: z.number(),
});

/** The seven fields the recent-orders feed renders — all the RPC sends (SEC-D2). */
export const recentOrderRowSchema = z.object({
    id: z.string(),
    status: z.string(),
    customer_name: z.string().nullable(),
    city: z.string().nullable(),
    /** null when the viewer lacks VIEW_FINANCIALS. */
    price: z.number().nullable(),
    created_at: z.string(),
    items: z.array(z.object({
        name: z.string(),
        quantity: z.number().nullable().optional(),
        price: z.number().nullable().optional(),
    }).passthrough()).nullable(),
});
export type RecentOrderRow = z.infer<typeof recentOrderRowSchema>;

export const dashboardMetricsSchema = z.object({
    urgency: z.object({
        failedDeliveries: z.number(),
        unconfirmedHighValue: z.number(),
        stuckInTransit: z.number(),
        highReturnCities: z.array(z.object({ city: z.string(), rate: z.number() })),
        cityRejectionStats: z.record(z.string(), z.object({
            total: z.number(), rejected: z.number(), rate: z.number(),
        })),
    }),
    funnel: z.array(z.object({
        id: z.string(), label: z.string(), value: z.number(), fill: z.string(),
    })),
    leaderboard: z.object({
        topCities: z.array(leaderboardItem),
        topProducts: z.array(leaderboardItem),
    }),
    todayStrip: z.object({
        ordersToday: z.number(),
        ordersYesterday: z.number(),
        ordersDelta: z.number(),
        ordersDeltaPct: z.number().nullable(),
        // SEC-D2: money is null for viewers without VIEW_FINANCIALS.
        revenueToday: z.number().nullable(),
        revenueYesterday: z.number().nullable(),
        revenueDelta: z.number().nullable(),
        revenueDeltaPct: z.number().nullable(),
    }),
    pipeline: z.array(z.object({
        status: z.string(), label: z.string(), count: z.number(),
        color: z.string(), textColor: z.string(), bgClass: z.string(),
    })),
    ordersPerHour: z.array(z.object({
        hour: z.number(), label: z.string(), count: z.number(),
    })),
    peakHeatmap: z.array(z.object({
        dayOfWeek: z.number(), hour: z.number(), count: z.number(), intensity: z.number(),
    })),
    deliveryRate: z.object({
        // COR-D7: null means "no terminal orders in the window", not 0%.
        currentRate: z.number().nullable(),
        sparkline: z.array(z.object({ day: z.string(), rate: z.number().nullable() })),
        trend: z.number().nullable(),
    }),
    avgTimePerStage: z.array(z.object({
        label: z.string(), avgHours: z.number(), sampleSize: z.number(),
    })),
    weekOverWeek: z.array(z.object({
        label: z.string(),
        current: z.number().nullable(),
        previous: z.number().nullable(),
        delta: z.number().nullable(),
        deltaPct: z.number().nullable(),
        isFinancial: z.boolean(),
        unit: z.string().optional(),
    })),
    monthForecast: z.object({
        projectedOrders: z.number(),
        projectedRevenue: z.number().nullable(),
        daysElapsed: z.number(),
        daysInMonth: z.number(),
        ordersThisMonth: z.number(),
        revenueThisMonth: z.number().nullable(),
        ordersPerDay: z.number(),
    }),
    enhancedLeaderboard: z.object({
        topCities: z.array(leaderboardItem),
        topProducts: z.array(leaderboardItem),
        topProductsEnhanced: z.array(leaderboardItem.extend({
            revenue: z.number().nullable(),
        })),
    }),
    staffLeaderboard: z.array(z.object({
        name: z.string(), ordersToday: z.number(), ordersThisWeek: z.number(), rank: z.number(),
    })),
    recentOrders: z.array(recentOrderRowSchema),
});

export type DashboardMetricsPayload = z.infer<typeof dashboardMetricsSchema>;
