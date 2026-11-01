"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, PrintBatch } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { fetchAllPages } from "@/lib/analytics/dashboard-order-facts";
import { DateRange } from "@/hooks/use-reports-metrics";

/**
 * Batch Analytics Hook
 * Fetches and calculates metrics for print batches
 */

export interface BatchMetrics {
    id: string;
    name: string;
    createdAt: Date;
    orderCount: number;
    totalValue: number;
    cities: string[];
    deliveryRate: number;
    rejectionRate: number;
    avgDeliveryTime: number; // hours
    status: 'pending' | 'in_progress' | 'completed' | 'mixed';
}

export interface BatchAnalyticsSummary {
    totalBatches: number;
    totalOrders: number;
    totalValue: number;
    avgOrdersPerBatch: number;
    avgBatchValue: number;
    avgDeliveryRate: number;
    topCities: { city: string; count: number }[];
    batchesByDay: { date: string; count: number; value: number }[];
}

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

    // Calculate batch metrics
    const batches = useMemo((): BatchMetrics[] => {
        return rawBatches.map(batch => {
            const orderIds = batch.order_ids || [];

            // Calculate delivery/rejection rates from order statuses
            let delivered = 0;
            let rejected = 0;
            const total = orderIds.length;

            orderIds.forEach(id => {
                const status = orderStatuses.get(id);
                if (status === 'delivered' || status === 'completed') delivered++;
                if (status === 'rejected') rejected++;
            });

            const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
            const rejectionRate = total > 0 ? (rejected / total) * 100 : 0;

            // Determine batch status
            let status: BatchMetrics['status'] = 'pending';
            if (delivered === total && total > 0) status = 'completed';
            else if (delivered > 0 && rejected > 0) status = 'mixed';
            else if (delivered > 0 || rejected > 0) status = 'in_progress';

            return {
                id: batch.id,
                name: batch.name,
                createdAt: new Date(batch.created_at),
                orderCount: batch.order_count,
                totalValue: batch.total_value || 0,
                cities: batch.cities || [],
                deliveryRate,
                rejectionRate,
                avgDeliveryTime: 0, // Would need more data to calculate
                status,
            };
        });
    }, [rawBatches, orderStatuses]);

    // Calculate summary metrics
    const summary = useMemo((): BatchAnalyticsSummary => {
        const totalBatches = batches.length;
        const totalOrders = batches.reduce((sum, b) => sum + b.orderCount, 0);
        const totalValue = batches.reduce((sum, b) => sum + b.totalValue, 0);
        const avgOrdersPerBatch = totalBatches > 0 ? totalOrders / totalBatches : 0;
        const avgBatchValue = totalBatches > 0 ? totalValue / totalBatches : 0;
        const avgDeliveryRate = totalBatches > 0
            ? batches.reduce((sum, b) => sum + b.deliveryRate, 0) / totalBatches
            : 0;

        // Top cities across all batches
        const cityCount: Record<string, number> = {};
        batches.forEach(b => {
            b.cities.forEach(city => {
                cityCount[city] = (cityCount[city] || 0) + b.orderCount / b.cities.length;
            });
        });
        const topCities = Object.entries(cityCount)
            .map(([city, count]) => ({ city, count: Math.round(count) }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Batches by day
        const byDay: Record<string, { count: number; value: number }> = {};
        batches.forEach(b => {
            const day = b.createdAt.toISOString().split('T')[0];
            if (!byDay[day]) byDay[day] = { count: 0, value: 0 };
            byDay[day].count++;
            byDay[day].value += b.totalValue;
        });
        const batchesByDay = Object.entries(byDay)
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
            totalBatches,
            totalOrders,
            totalValue,
            avgOrdersPerBatch,
            avgBatchValue,
            avgDeliveryRate,
            topCities,
            batchesByDay,
        };
    }, [batches]);

    return {
        batches,
        summary,
        loading,
        error,
        refresh,
    };
}
