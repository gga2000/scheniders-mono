"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useMetaAdsConnection } from "@/hooks/use-meta-ads";
import { canAccessRoute } from "@/lib/route-permissions";
import { storeOverviewSchema } from "@/lib/analytics/store-overview";
import {
    panelStatsSchema,
    stripWindows,
    storeFigures,
    type PanelStats,
    type PanelWindow,
    type StripPeriod,
} from "@/lib/orders/analytics-strip";

/** Supabase returns at most 1000 rows per request; walk the pages. */
const PAGE = 1000;
const REFRESH_MS = 60_000;
const TICK_MS = 5 * 60_000;

function usePanelStats(window: PanelWindow) {
    const { tenantId } = useAuth();
    return useQuery<PanelStats>({
        queryKey: ["orders-panel-stats", tenantId, window.from, window.to, window.untilTime],
        queryFn: async () => {
            if (!tenantId) throw new Error("orders panel stats requested without a tenant");
            const { data, error } = await supabase.rpc("get_orders_panel_stats", {
                _tenant_id: tenantId,
                _from: window.from,
                _to: window.to,
                ...(window.untilTime ? { _until_time: window.untilTime } : {}),
            });
            if (error) throw error;
            return panelStatsSchema.parse(data ?? {});
        },
        enabled: !!tenantId,
        staleTime: REFRESH_MS,
    });
}

/** Meta spend (IQD) per Baghdad day in a range, summed. Admin-only table: other roles get no rows. */
async function fetchAdSpend(from: string, to: string): Promise<number> {
    let total = 0;
    for (let start = 0; ; start += PAGE) {
        const { data, error } = await supabase
            .from("ad_spend_daily")
            .select("spend_iqd")
            .gte("spend_date", from)
            .lte("spend_date", to)
            .range(start, start + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) total += Number(row.spend_iqd);
        if ((data?.length ?? 0) < PAGE) return total;
    }
}

function useAdSpend(window: PanelWindow, enabled: boolean) {
    return useQuery({
        queryKey: ["orders-panel-ad-spend", window.from, window.to],
        queryFn: () => fetchAdSpend(window.from, window.to),
        enabled,
        staleTime: REFRESH_MS,
    });
}

/** Visitors and orders per day from the first-party storefront log, 60 days: enough for a 30-day window and the one before it. */
function useStoreDays() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["orders-panel-store-days", tenantId],
        queryFn: async () => {
            if (!tenantId) throw new Error("store days requested without a tenant");
            const { data, error } = await supabase.rpc("get_store_overview", { _tenant_id: tenantId, _days: 60 });
            if (error) throw error;
            return storeOverviewSchema.parse(data ?? {});
        },
        enabled: !!tenantId,
        staleTime: REFRESH_MS,
    });
}

/**
 * Everything the orders analytics strip shows for a period: orders and revenue from get_orders_panel_stats
 * (server-side, Baghdad days, the same revenue rule as Finances), the storefront's visitors and conversion,
 * and Meta spend for people who may open /ads on a connected store.
 */
export function useOrdersPanelStats(period: StripPeriod) {
    const { role, permissions } = useAuth();
    // "Today so far" is cut at the current Baghdad time, so the windows move on every tick: the cut-off
    // (and the day itself, past midnight) never goes stale, and each tick fetches fresh numbers.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), TICK_MS);
        return () => clearInterval(id);
    }, []);
    const windows = useMemo(() => stripWindows(period, now), [period, now]);

    const current = usePanelStats(windows.current);
    const previous = usePanelStats(windows.previous);
    const qualityCurrent = usePanelStats(windows.quality.current);
    const qualityPrevious = usePanelStats(windows.quality.previous);

    const store = useStoreDays();
    const storeResult = useMemo(
        () => (store.data ? storeFigures(store.data.days, store.data.yesterday_same_time, windows) : null),
        [store.data, windows],
    );

    const connection = useMetaAdsConnection();
    const adsOn = canAccessRoute("/ads", role, permissions) && connection.data?.is_active === true;
    const spend = useAdSpend(windows.current, adsOn);

    return {
        windows,
        current,
        previous,
        qualityCurrent,
        qualityPrevious,
        store: { figures: storeResult, hasTraffic: (store.data?.days ?? []).some((d) => d.visitors > 0) },
        ads: adsOn ? { spend } : null,
    };
}
