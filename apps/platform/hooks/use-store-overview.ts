"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { storeOverviewMetrics, storeOverviewSchema, type OverviewMetric } from "@/lib/analytics/store-overview";

export const STORE_OVERVIEW_DAYS = 14;

/** Visitors / orders / sales per Baghdad day from the first-party storefront log. */
export function useStoreOverview() {
    const { tenantId } = useAuth();
    return useQuery<OverviewMetric[]>({
        queryKey: ["storefront-overview", tenantId],
        queryFn: async () => {
            if (!tenantId) throw new Error("store overview requested without a tenant");
            const { data, error } = await supabase.rpc("get_store_overview", {
                _tenant_id: tenantId,
                _days: STORE_OVERVIEW_DAYS,
            });
            if (error) throw error;
            return storeOverviewMetrics(storeOverviewSchema.parse(data ?? {}));
        },
        enabled: !!tenantId,
        staleTime: 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
    });
}
