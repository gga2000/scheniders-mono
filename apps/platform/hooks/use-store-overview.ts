"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { STORE_OVERVIEW_MAX_DAYS, storeOverviewSchema, type StoreOverviewRaw } from "@/lib/analytics/store-overview";

/**
 * Visitors / orders / sales per Baghdad day from the first-party storefront log:
 * the 60 days the RPC keeps, enough for 30 days and the 30 before them. Each
 * period is cut from this one read (storeOverviewMetrics), so changing the
 * header's period never waits on the network.
 */
export function useStoreOverview() {
    const { tenantId } = useAuth();
    return useQuery<StoreOverviewRaw>({
        queryKey: ["storefront-overview", tenantId, STORE_OVERVIEW_MAX_DAYS],
        queryFn: async () => {
            if (!tenantId) throw new Error("store overview requested without a tenant");
            const { data, error } = await supabase.rpc("get_store_overview", {
                _tenant_id: tenantId,
                _days: STORE_OVERVIEW_MAX_DAYS,
            });
            if (error) throw error;
            return storeOverviewSchema.parse(data ?? {});
        },
        enabled: !!tenantId,
        staleTime: 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
    });
}
