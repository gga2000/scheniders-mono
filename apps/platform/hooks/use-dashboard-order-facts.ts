"use client";

import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import type { DateRangeKey, TrendDays } from "@/lib/analytics/dashboard-calculations";
import {
    factColumns,
    factFilter,
    fetchAllPages,
    geoFactSchema,
    trendFactSchema,
    type GeoFact,
    type OrderFactsWindow,
    type TrendFact,
} from "@/lib/analytics/dashboard-order-facts";

/**
 * Complete per-order facts for the dashboard's trend chart and map, read from the
 * server for exactly their window (see lib/analytics/dashboard-order-facts.ts).
 *
 * Keyed under "dashboard-metrics" so the same orders-changed invalidation that
 * refreshes the metrics RPC refreshes these too.
 */
function useOrderFacts<T>(window: OrderFactsWindow, schema: z.ZodType<T>) {
    const { session, clientReady, tenantId } = useAuth();
    const { canReveal } = useFinancialVisibility();
    const param = window.kind === "trend" ? window.days : window.range;

    return useQuery<T[]>({
        queryKey: ["dashboard-metrics", "order-facts", tenantId, window.kind, param, canReveal],
        queryFn: async () => {
            if (!tenantId) throw new Error("dashboard order facts requested without a tenant");
            const filter = factFilter(window);
            const columns = factColumns(window.kind, canReveal);
            const rows = await fetchAllPages(async (from, to) => {
                let query = supabase
                    .from("orders")
                    .select(columns)
                    .eq("tenant_id", tenantId)
                    .eq("is_archived", false)
                    .is("deleted_at", null)
                    .neq("status", "pending_checkout");
                if (filter.type === "or") query = query.or(filter.expression);
                if (filter.type === "createdSince") query = query.gte("created_at", filter.since);
                // A stable order is what makes offset paging complete.
                const { data, error } = await query.order("id", { ascending: true }).range(from, to);
                if (error) throw error;
                return data ?? [];
            });
            return schema.array().parse(rows);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        retry: 2,
    });
}

/** Orders created or realized in the last `days` Baghdad days. */
export function useTrendFacts(days: TrendDays) {
    return useOrderFacts<TrendFact>({ kind: "trend", days }, trendFactSchema);
}

/** Orders created inside the dashboard range, by governorate. */
export function useGeoFacts(range: DateRangeKey) {
    return useOrderFacts<GeoFact>({ kind: "geo", range }, geoFactSchema);
}
