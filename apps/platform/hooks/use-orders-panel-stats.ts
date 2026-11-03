"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { OrderFilters } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useMetaAdsConnection } from "@/hooks/use-meta-ads";
import { canAccessRoute } from "@/lib/route-permissions";
import { storeOverviewSchema } from "@/lib/analytics/store-overview";
import {
    barWindows,
    followsStoreWideNumbers,
    isSalesView,
    panelStatsSchema,
    storeFigures,
    type PanelStats,
    type PanelWindow,
} from "@/lib/orders/analytics-strip";

/** Supabase returns at most 1000 rows per request; walk the pages. */
const PAGE = 1000;
const REFRESH_MS = 60_000;
const TICK_MS = 5 * 60_000;

/** The page filters the bar follows: the ones get_orders_aggregates (the status chips' server twin) also takes. */
type BarScope = Pick<OrderFilters, "city" | "product" | "priority" | "paymentStatus">;

function usePanelStats(window: PanelWindow | null, scope: BarScope, enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery<PanelStats>({
        queryKey: ["orders-panel-stats", tenantId, window, scope],
        queryFn: async () => {
            if (!tenantId || !window) throw new Error("orders panel stats requested without a tenant or window");
            const { data, error } = await supabase.rpc("get_orders_panel_stats", {
                _tenant_id: tenantId,
                _from: window.from ?? undefined,
                _to: window.to ?? undefined,
                _until_time: window.untilTime ?? undefined,
                _city: scope.city ?? undefined,
                _product: scope.product ?? undefined,
                _priority: scope.priority ?? undefined,
                _payment_status: scope.paymentStatus ?? undefined,
            });
            if (error) throw error;
            return panelStatsSchema.parse(data ?? {});
        },
        enabled: !!tenantId && window !== null && enabled,
        staleTime: REFRESH_MS,
    });
}

/** Meta spend (IQD) over a range, summed. Admin-only table: other roles get no rows. */
async function fetchAdSpend(from: string | null, to: string | null): Promise<number> {
    let total = 0;
    for (let start = 0; ; start += PAGE) {
        let query = supabase.from("ad_spend_daily").select("spend_iqd");
        if (from) query = query.gte("spend_date", from);
        if (to) query = query.lte("spend_date", to);
        const { data, error } = await query.range(start, start + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) total += Number(row.spend_iqd);
        if ((data?.length ?? 0) < PAGE) return total;
    }
}

const limitSchema = z.object({
    success: z.literal(true),
    limit: z.object({ leftIqd: z.number(), capIqd: z.number(), owedIqd: z.number() }).nullable(),
});

/** Room left under the Meta account's spending limit (IQD); null when Meta sets no limit. Admin-only route. */
function useAdLimit(enabled: boolean) {
    const { session } = useAuth();
    const token = session?.access_token ?? "";
    return useQuery({
        queryKey: ["orders-panel-ad-limit"],
        queryFn: async () => {
            const res = await fetch("/api/settings/meta-ads/limit", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Meta limit failed: ${res.status}`);
            return limitSchema.parse(await res.json()).limit;
        },
        enabled: enabled && token !== "",
        staleTime: TICK_MS,
        retry: false,
    });
}

/** Visitors and orders per day from the first-party storefront log, the longest stretch it answers (60 days). */
function useStoreDays(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["orders-panel-store-days", tenantId],
        queryFn: async () => {
            if (!tenantId) throw new Error("store days requested without a tenant");
            const { data, error } = await supabase.rpc("get_store_overview", { _tenant_id: tenantId, _days: 60 });
            if (error) throw error;
            return storeOverviewSchema.parse(data ?? {});
        },
        enabled: !!tenantId && enabled,
        staleTime: REFRESH_MS,
    });
}

/**
 * Everything the orders analytics bar shows for the page's current filters: orders and revenue from get_orders_panel_stats (server-side, Baghdad days, the revenue rule Finances uses), Meta spend
 * for people who may open /ads on a connected store, and the storefront's visitors. Ad spend and visitors are
 * store-wide, so they only appear while no city / product / priority / payment filter narrows the list.
 */
export function useOrdersPanelStats(filters: OrderFilters) {
    const { role, permissions } = useAuth();
    // "Today so far" is cut at the current Baghdad time, so the windows move on every tick: the cut-off
    // (and the day itself, past midnight) never goes stale, and each tick fetches fresh numbers.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), TICK_MS);
        return () => clearInterval(id);
    }, []);
    const windows = useMemo(() => barWindows(filters.dateFrom, filters.dateTo, now), [filters.dateFrom, filters.dateTo, now]);

    const salesView = isSalesView(filters);
    const scope = useMemo<BarScope>(
        () => ({ city: filters.city, product: filters.product, priority: filters.priority, paymentStatus: filters.paymentStatus }),
        [filters.city, filters.product, filters.priority, filters.paymentStatus],
    );
    const storeWide = salesView && followsStoreWideNumbers(scope);

    const current = usePanelStats(windows.current, scope, salesView);
    const previous = usePanelStats(windows.previous, scope, salesView);

    const store = useStoreDays(storeWide);
    const storeResult = useMemo(
        () => (store.data ? storeFigures(store.data.days, store.data.yesterday_same_time, windows) : null),
        [store.data, windows],
    );

    const connection = useMetaAdsConnection();
    const adsOn = storeWide && canAccessRoute("/ads", role, permissions) && connection.data?.is_active === true;
    const spend = useQuery({
        queryKey: ["orders-panel-ad-spend", windows.current.from, windows.current.to],
        queryFn: () => fetchAdSpend(windows.current.from, windows.current.to),
        enabled: adsOn,
        staleTime: REFRESH_MS,
    });

    const limit = useAdLimit(adsOn);

    return {
        salesView,
        windows,
        current,
        previous,
        store: { figures: storeResult?.current ? storeResult : null, show: storeWide && (store.data?.days ?? []).some((d) => d.visitors > 0) },
        ads: adsOn ? { spend, limit } : null,
    };
}
