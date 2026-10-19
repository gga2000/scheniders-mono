"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { OrderFilters } from "@/lib/supabase";

/**
 * Status counts, filter options and headline stats, computed by the server.
 *
 * The dashboard reads all of it. The orders page no longer reads
 * `status_counts`: its chips are counted over the rows the list shows, with
 * the list's own predicates (lib/orders/order-chips.ts), because these were
 * never invalidated by list writes and used different rules for completed and
 * refunds (the 219-vs-119 incident, 2026-10-17).
 *
 * These were derived by scanning every loaded order, which is a large part of
 * why the page had to download the whole book. Worse, they are the numbers a
 * merchant trusts: once the fetch is windowed, deriving them from the loaded
 * rows would report "12 confirmed" while the filter actually matches 300, and
 * look entirely plausible doing it.
 *
 * `get_orders_aggregates` reproduces the previous client semantics deliberately
 * — including bucketing revenue on created_at (COR-4) — so switching the source
 * changes no number the merchant currently sees.
 */

export type OrdersAggregates = {
    status_counts: Record<string, number>;
    stats: Record<string, number>;
    cities: string[];
    products: string[];
    total_risk_count: number;
};

/**
 * `options.enabled` lets a caller hold the query until its filter is final.
 * The orders page passes `filtersSettled`: its filter state starts at a seed
 * and is then replaced by the merchant's saved filter, and querying the seed
 * cost one RPC for numbers nobody saw. The dashboard passes nothing and keeps
 * the query enabled, unchanged. A disabled observer on the same key never stops
 * an enabled one.
 */
export function useOrdersAggregates(filters: OrderFilters, options: { enabled?: boolean } = {}) {
    const { tenantId } = useAuth();

    // Only the filters the RPC understands. Free-text search is NOT among them:
    // it still runs client-side over the loaded rows, so aggregates stay
    // unfiltered by it rather than silently disagreeing with the list.
    const params = {
        _tenant_id: tenantId,
        _date_from: filters.dateFrom ?? null,
        _date_to: filters.dateTo ?? null,
        _city: filters.city ?? null,
        _product: filters.product ?? null,
        _priority: filters.priority ?? null,
        _payment_status: filters.paymentStatus ?? null,
        _is_return: filters.isReturn ?? null,
        _order_type: (filters as { orderType?: string }).orderType ?? null,
    };

    return useQuery({
        queryKey: ["orders", "aggregates", params],
        queryFn: async (): Promise<OrdersAggregates> => {
            const { data, error } = await supabase.rpc("get_orders_aggregates", params);
            if (error) throw error;
            return data as unknown as OrdersAggregates;
        },
        enabled: !!tenantId && (options.enabled ?? true),
        staleTime: 30_000,
    });
}
