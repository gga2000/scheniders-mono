"use client";

import { useMemo } from "react";
import { useFinanceOrders } from "@/hooks/use-finance-orders";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useExpenses } from "@/hooks/use-expenses";
import { useOrderCostSnapshots } from "@/hooks/use-order-cost-snapshots";
import { useFinanceOverview } from "@/hooks/use-finance-overview";
import { addDaysToDayKey, baghdadDayStart } from "@/lib/order-window";

interface DayRange {
    /** First Baghdad day, inclusive, as yyyy-mm-dd. */
    since: string;
    /** Last Baghdad day, inclusive, as yyyy-mm-dd. */
    until: string;
}

export interface NetProfitForRange {
    /** Delivered revenue minus frozen product cost, refunds and every expense (Meta ads included). */
    netProfit: number;
    /** Expenses in the marketing category, including the auto-posted Meta ad spend. */
    marketingCost: number;
    deliveredRevenue: number;
    loading: boolean;
    error: string | null;
}

/**
 * The Finances page's net profit for a Baghdad day range, for other pages that
 * want the same number (the Ads page shows profit after ad spend). It runs the
 * very same sources and rules as the Finances Overview — frozen order costs,
 * Baghdad days, refunds and every expense — so the two pages cannot disagree.
 * Loads the range's orders, the products and the range's expenses, so call it
 * from one place per page.
 */
export function useNetProfitForRange({ since, until }: DayRange): NetProfitForRange {
    const period = useMemo(
        () => ({
            start: new Date(baghdadDayStart(since)),
            end: new Date(baghdadDayStart(addDaysToDayKey(until, 1)) - 1),
        }),
        [since, until],
    );

    const { orders, loading: ordersLoading, error } = useFinanceOrders({ start: period.start, end: period.end });
    const { products } = useProductsCrud();
    const { expenses, loading: expensesLoading } = useExpenses({ startDate: since, endDate: until });
    const snapshots = useOrderCostSnapshots();
    const overview = useFinanceOverview(orders, products, expenses, period, null, "day", snapshots);

    return {
        netProfit: overview.net_profit,
        marketingCost: overview.marketing_cost,
        deliveredRevenue: overview.delivered_revenue,
        loading: ordersLoading || expensesLoading,
        error,
    };
}
