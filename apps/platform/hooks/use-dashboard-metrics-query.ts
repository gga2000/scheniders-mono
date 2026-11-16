"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryCacheNotifyEvent } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { reportError } from "@/lib/report-error";
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";
import type { DashboardMetrics } from "@/lib/analytics/dashboard-metrics-schema";
import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { dashboardMetricsSchema } from "@/lib/analytics/dashboard-metrics-schema";

/** How long to wait after the orders cache settles before refreshing metrics. */
const METRICS_REFRESH_DEBOUNCE_MS = 1_500;

/**
 * Server-side dashboard metrics.
 *
 * The dashboard used to gate its first paint on fetching the ENTIRE active
 * orders table (~5.8MB / 12k rows) just to reduce it to a handful of
 * aggregates on the client's main thread. This hook calls the
 * `get_dashboard_metrics(p_range)` SQL function instead, which performs the
 * same 14 reductions in Postgres and returns a few KB of JSON — so the
 * dashboard can paint without waiting for the full table.
 *
 * It is the ONLY source of dashboard numbers (ORD-2). The page renders a skeleton
 * until it resolves and an error state if it fails; it never derives figures from
 * the orders list, which is a window of the book, not the book.
 *
 * RLS-scoped per tenant via SECURITY INVOKER (the function runs as the caller),
 * so each tenant only ever aggregates its own orders.
 */
/**
 * True when an orders list in the cache took on new data after it had already
 * loaded: a realtime row, an optimistic write, a delta sync or a refetch.
 *
 * A list's first load is not a change, and neither is a fetch starting. Both
 * used to count, so the dashboard's own first orders read refetched every
 * metrics query it had just loaded.
 */
export function isOrdersListChange(event: QueryCacheNotifyEvent): boolean {
    if (event.type !== "updated" || event.action.type !== "success") return false;
    const key = event.query.queryKey;
    if (!Array.isArray(key) || key[0] !== "orders" || key[1] !== "list") return false;
    return event.query.state.dataUpdateCount > 1;
}

export function useDashboardMetricsQuery(range: DateRangeKey = "all") {
    const { session, clientReady, tenantId } = useAuth();
    const queryClient = useQueryClient();

    // ENG-D2: nothing used to invalidate these metrics, so the dashboard could sit
    // on a 2-minute-stale cache while the feed pulsed "Live" — including for the
    // user who had just changed the order. Watch the orders cache instead of
    // wiring into one specific writer: this covers realtime, optimistic mutations
    // and delta-sync alike, debounced so a burst of events costs one refetch.
    //
    // Each instance refreshes only its own range: with the "all" and the period
    // query both mounted, invalidating the whole prefix from both made four
    // calls where two were needed.
    useEffect(() => {
        const cache = queryClient.getQueryCache();
        let timer: ReturnType<typeof setTimeout> | null = null;

        const unsubscribe = cache.subscribe((event) => {
            if (!isOrdersListChange(event)) return;

            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                diag.log("[Diag:RQ:Metrics] orders changed — refreshing dashboard metrics");
                queryClient.invalidateQueries({ queryKey: ["dashboard-metrics", range] });
            }, METRICS_REFRESH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [queryClient, range]);

    return useQuery<DashboardMetrics>({
        queryKey: ["dashboard-metrics", range, tenantId],
        queryFn: async () => {
            if (!tenantId) throw new Error("dashboard metrics requested without a shop");
            const _t = performance.now();
            perfTrace.markRepeat("dashboard-metrics:fetch-start", { range });
            diag.log(`[Diag:RQ:Metrics] get_dashboard_metrics START range=${range}`);

            // Named shop: a member of two shops must see only the one open (audit R2 N4).
            const { data, error } = await supabase.rpc("get_dashboard_metrics", {
                p_range: range,
                p_tenant_id: tenantId,
            });

            if (error) {
                diag.error(`[Diag:RQ:Metrics] get_dashboard_metrics ERR err=${error.message}`);
                throw error;
            }

            perfTrace.mark("dashboard-metrics:fetch-done", { range });
            diag.log(`[Diag:RQ:Metrics] get_dashboard_metrics OK range=${range} took=${(performance.now() - _t).toFixed(1)}ms`);

            // ARCH-D3: parse, do not assert. This used to be
            // `data as unknown as DashboardMetrics` — a double cast over a shape
            // nobody checked, so any drift between the SQL function and the TS type
            // would arrive as `undefined` inside widgets and render as blanks or
            // NaN. Failing here instead routes through the same path as any other
            // RPC error: reported to Sentry, and the page shows an error with a
            // retry rather than a number it cannot vouch for.
            const parsed = dashboardMetricsSchema.safeParse(data);
            if (!parsed.success) {
                const contractError = new Error(
                    `get_dashboard_metrics returned an unexpected shape: ${parsed.error.issues
                        .slice(0, 5)
                        .map((i) => `${i.path.join(".")} ${i.message}`)
                        .join("; ")}`,
                );
                diag.error(`[Diag:RQ:Metrics] contract mismatch — ${contractError.message}`);
                reportError(contractError, {
                    tags: { area: "dashboard", rpc: "get_dashboard_metrics", range, kind: "contract" },
                    extra: { issues: parsed.error.issues.slice(0, 20) },
                });
                throw contractError;
            }

            return parsed.data;
        },
        // Same auth gate as orders: wait for the client's session to be ready.
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    });
}
