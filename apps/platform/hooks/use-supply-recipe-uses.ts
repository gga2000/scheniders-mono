import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * How many recipe rows use this supply. The database refuses to untick
 * "supply" while any does (trg_products_supply_in_recipe), so the editor locks
 * the toggle instead of letting the save fail.
 */
export function useSupplyRecipeUses(supplyId: string | undefined, enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["supply-recipe-uses", tenantId, supplyId],
        enabled: enabled && !!tenantId && !!supplyId,
        staleTime: 60_000,
        queryFn: async (): Promise<number> => {
            if (!tenantId || !supplyId) return 0;
            const { count, error } = await supabase
                .from("bom_items")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .eq("supply_id", supplyId);
            if (error) throw error;
            return count ?? 0;
        },
    });
}
