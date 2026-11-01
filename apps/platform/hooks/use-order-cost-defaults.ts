"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { NO_ORDER_COSTS, parseOrderCostDefaults, type OrderCostDefaults } from "@/lib/finance/order-cost-defaults";

/** This store's per-order costs (courier, bag, vial, sweets); none until it sets them. */
export function useOrderCostDefaults(): OrderCostDefaults {
    const { tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: ["order-cost-defaults", tenantId],
        enabled: !!tenantId,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<OrderCostDefaults> => {
            if (!tenantId) throw new Error("No active tenant");
            const { data: tenant, error } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
            if (error) throw error;
            return parseOrderCostDefaults(tenant?.settings);
        },
    });
    return data ?? NO_ORDER_COSTS;
}
