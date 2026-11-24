"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { OrderFilters } from "@/lib/supabase";
import { ordersAggregatesKey, ordersAggregatesParams, readOrdersAggregates } from "@/lib/orders/aggregates-read";

export type { OrdersAggregates } from "@/lib/orders/aggregates-read";

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

    const params = ordersAggregatesParams(tenantId, filters);

    return useQuery({
        queryKey: ordersAggregatesKey(params),
        queryFn: () => readOrdersAggregates(supabase, params),
        enabled: !!tenantId && (options.enabled ?? true),
        staleTime: 30_000,
    });
}
