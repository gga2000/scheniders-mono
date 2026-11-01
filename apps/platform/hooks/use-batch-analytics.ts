"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, PrintBatch } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { fetchAllPages } from "@/lib/analytics/dashboard-order-facts";
import { DateRange } from "@/hooks/use-reports-metrics";
import {
    calculateBatchMetrics,
    summarizeBatches,
    type BatchAnalyticsSummary,
    type BatchMetrics,
} from "@/lib/analytics/batch-metrics";

export type { BatchAnalyticsSummary, BatchMetrics };

/**
 * Batch Analytics Hook
 * Fetches and calculates metrics for print batches
 */

export interface UseBatchAnalyticsResult {
    batches: BatchMetrics[];
    summary: BatchAnalyticsSummary;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/** Order ids per `.in()` request: keeps the URL well under the gateway limit. */
const ID_CHUNK = 200;

export function useBatchAnalytics(dateRange: DateRange): UseBatchAnalyticsResult {
    const { session, clientReady, tenantId } = useAuth();
    const from = dateRange.from.toISOString();
    const to = dateRange.to.toISOString();

    const query = useQuery({
        queryKey: ["reports", "batch-analytics", tenantId, from, to],
        queryFn: async () => {
            if (!tenantId) throw new Error("batch analytics requested without a tenant");
            const batches = await fetchAllPages<PrintBatch>(async (start, end) => {
                const { data, error } = await supabase
                    .from("print_batches")
                    .select("*")
                    .eq("tenant_id", tenantId)
                    .gte("created_at", from)
                    .lte("created_at", to)
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .range(start, end);
                if (error) throw new Error(error.message);
                return data ?? [];
            });

            // A batch holds hundreds of order ids; one `.in()` with all of them overflows the URL
            // and the status lookup used to fail silently, reading every batch as 0% delivered.
            const allOrderIds = [...new Set(batches.flatMap(b => b.order_ids || []))];
            const statuses: [string, string][] = [];
            for (let i = 0; i < allOrderIds.length; i += ID_CHUNK) {
                const { data, error } = await supabase
                    .from("orders")
                    .select("id, status")
                    .eq("tenant_id", tenantId)
                    .is("deleted_at", null)
                    .neq("status", "pending_checkout")
                    .in("id", allOrderIds.slice(i, i + ID_CHUNK));
                if (error) throw new Error(error.message);
                (data ?? []).forEach(o => statuses.push([o.id, o.status]));
            }
            return { batches, statuses };
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        retry: 2,
    });

    const rawBatches = useMemo(() => query.data?.batches ?? [], [query.data]);
    const orderStatuses = useMemo(() => new Map(query.data?.statuses ?? []), [query.data]);
    const loading = query.isPending;
    const error = query.error ? query.error.message : null;
    const { refetch } = query;
    const refresh = useCallback(async () => { await refetch(); }, [refetch]);

    const batches = useMemo(() => calculateBatchMetrics(rawBatches, orderStatuses), [rawBatches, orderStatuses]);
    const summary = useMemo(() => summarizeBatches(batches), [batches]);

    return {
        batches,
        summary,
        loading,
        error,
        refresh,
    };
}
