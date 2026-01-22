"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, PrintBatch } from "@/lib/supabase";
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

export function useBatchAnalytics(dateRange: DateRange): UseBatchAnalyticsResult {
    const [rawBatches, setRawBatches] = useState<PrintBatch[]>([]);
    const [orderStatuses, setOrderStatuses] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch batches within date range
            const { data: batchData, error: batchError } = await supabase
                .from("print_batches")
                .select("*")
                .gte("created_at", dateRange.from.toISOString())
                .lte("created_at", dateRange.to.toISOString())
                .order("created_at", { ascending: false });

            if (batchError) throw new Error(batchError.message);

            setRawBatches(batchData || []);

            // Get all order IDs from batches
            const allOrderIds = (batchData || [])
                .flatMap(b => b.order_ids || [])
                .filter((id, index, arr) => arr.indexOf(id) === index);

            if (allOrderIds.length > 0) {
                // Fetch order statuses for delivery rate calculation
                const { data: orderData } = await supabase
                    .from("orders")
                    .select("id, status, delivered_at, created_at")
                    .in("id", allOrderIds);

                const statusMap = new Map<string, string>();
                (orderData || []).forEach(o => statusMap.set(o.id, o.status));
                setOrderStatuses(statusMap);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch batch analytics");
        } finally {
            setLoading(false);
        }
    }, [dateRange.from, dateRange.to]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Calculate batch metrics
    const batches = useMemo((): BatchMetrics[] => {
        return rawBatches.map(batch => {
            const orderIds = batch.order_ids || [];

            // Calculate delivery/rejection rates from order statuses
            let delivered = 0;
            let rejected = 0;
            let total = orderIds.length;

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
            else if (delivered > 0 || rejected > 0) status = 'in_progress';
            else if (delivered > 0 && rejected > 0) status = 'mixed';

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
        refresh: fetchData,
    };
}
