"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { productKeys } from "@/hooks/use-products-query";
import { buildStockToday } from "@/lib/orders/stock-today";

/**
 * What each product has left today, from `get_stock_today(p_tenant_id)`.
 * The RPC checks membership of the tenant. While the dialog is open it
 * refreshes every 30 seconds, so a confirm on another screen shows up.
 */
export function useStockTodayQuery(enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    return useQuery({
        queryKey: [...productKeys.all, "stock-today", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase.rpc("get_stock_today", { p_tenant_id: tenantId });
            if (error) throw error;
            return buildStockToday(data ?? []);
        },
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 0,
        refetchInterval: enabled ? 30_000 : false,
    });
}
