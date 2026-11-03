import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Units of each supply used up in the last 30 days, grouped in the database
 * (reading raw history rows stops at the API row cap and makes busy stores
 * look slower than they are). Every supplies screen reads its rate from this,
 * so cards, list, drawers and Today's actions show the same days left.
 */
export function useSupplyUsage30d() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["supply-usage-30d", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async () => {
            const usage = new Map<string, number>();
            if (!tenantId) return usage;
            const { data, error } = await supabase.rpc("supply_usage_30d", { p_tenant_id: tenantId });
            if (error) throw error;
            for (const row of data ?? []) usage.set(row.product_id, Number(row.used));
            return usage;
        },
    });
}
