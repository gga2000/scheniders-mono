"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import * as Sentry from "@sentry/nextjs";
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";
import type { DashboardMetrics } from "@/hooks/use-dashboard-metrics";
import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { dashboardMetricsSchema } from "@/lib/analytics/dashboard-metrics-schema";

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
 * RLS-scoped per tenant via SECURITY INVOKER (the function runs as the caller),
 * so each tenant only ever aggregates its own orders.
 */
/** How long to wait after the orders cache settles before refreshing metrics. */
const METRICS_REFRESH_DEBOUNCE_MS = 1_500;

export function useDashboardMetricsQuery(range: DateRangeKey = "all") {
    const { session, clientReady } = useAuth();
    const queryClient = useQueryClient();

    // ENG-D2: nothing used to invalidate these metrics, so the dashboard could sit
    // on a 2-minute-stale cache while the feed pulsed "Live" — including for the
    // user who had just changed the order. Watch the orders cache instead of
    // wiring into one specific writer: this covers realtime, optimistic mutations
    // and delta-sync alike, debounced so a burst of events costs one refetch.
    useEffect(() => {
        const cache = queryClient.getQueryCache();
        let timer: ReturnType<typeof setTimeout> | null = null;

        const unsubscribe = cache.subscribe((event) => {
            if (event.type !== "updated") return;
            const key = event.query.queryKey;
            if (!Array.isArray(key) || key[0] !== "orders" || key[1] !== "list") return;

            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                diag.log("[Diag:RQ:Metrics] orders changed — refreshing dashboard metrics");
                queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            }, METRICS_REFRESH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [queryClient]);

    return useQuery<DashboardMetrics>({
        queryKey: ["dashboard-metrics", range],
        queryFn: async () => {
            const _t = performance.now();
            perfTrace.markRepeat("dashboard-metrics:fetch-start", { range });
            diag.log(`[Diag:RQ:Metrics] get_dashboard_metrics START range=${range}`);

            const { data, error } = await supabase.rpc("get_dashboard_metrics", {
                p_range: range,
            });

            if (error) {
                diag.error(`[Diag:RQ:Metrics] get_dashboard_metrics ERR err=${error.message}`);
                // OBS-D1: when this fails the dashboard silently falls back to the
                // local engine (ENG-D1). Without a report, nobody would ever learn
                // the aggregate query was broken for real merchants.
                Sentry.captureException(error, {
                    tags: { area: "dashboard", rpc: "get_dashboard_metrics", range },
                });
                throw error;
            }

            perfTrace.mark("dashboard-metrics:fetch-done", { range });
            diag.log(`[Diag:RQ:Metrics] get_dashboard_metrics OK range=${range} took=${(performance.now() - _t).toFixed(1)}ms`);

            // ARCH-D3: parse, do not assert. This used to be
            // `data as unknown as DashboardMetrics` — a double cast over a shape
            // nobody checked, so any drift between the SQL function and the TS type
            // would arrive as `undefined` inside widgets and render as blanks or
            // NaN. Failing here instead routes through the same path as any other
            // RPC error: reported to Sentry, and the page falls back to the local
            // engine, which announces itself (ENG-D1).
            const parsed = dashboardMetricsSchema.safeParse(data);
            if (!parsed.success) {
                const contractError = new Error(
                    `get_dashboard_metrics returned an unexpected shape: ${parsed.error.issues
                        .slice(0, 5)
                        .map((i) => `${i.path.join(".")} ${i.message}`)
                        .join("; ")}`,
                );
                diag.error(`[Diag:RQ:Metrics] contract mismatch — ${contractError.message}`);
                Sentry.captureException(contractError, {
                    tags: { area: "dashboard", rpc: "get_dashboard_metrics", range, kind: "contract" },
                    extra: { issues: parsed.error.issues.slice(0, 20) },
                });
                throw contractError;
            }

            return parsed.data;
        },
        // Same auth gate as orders: wait for the client's session to be ready.
        enabled: !!session && clientReady,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    });
}
