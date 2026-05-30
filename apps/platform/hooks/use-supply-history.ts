import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export interface InventoryHistoryEntry {
    id: string;
    product_id: string;
    change_type: string | null;
    quantity_change: number | null;
    quantity_before: number | null;
    quantity_after: number | null;
    notes: string | null;
    reference_id: string | null;
    created_at: string | null;
}

/**
 * Fetches inventory_history for a single product (supply). Used by the supply
 * detail drawer to render the History tab + a 30-day sparkline of movements.
 */
export function useSupplyHistory(productId: string | null, enabled: boolean = true) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["supply-history", tenantId, productId],
        enabled: !!tenantId && !!productId && enabled,
        staleTime: 60_000,
        queryFn: async (): Promise<InventoryHistoryEntry[]> => {
            if (!tenantId || !productId) return [];
            const { data, error } = await supabase
                .from("inventory_history")
                .select(
                    "id, product_id, change_type, quantity_change, quantity_before, quantity_after, notes, reference_id, created_at"
                )
                .eq("tenant_id", tenantId)
                .eq("product_id", productId)
                .order("created_at", { ascending: false })
                .limit(200);
            if (error) throw error;
            return (data ?? []) as InventoryHistoryEntry[];
        },
    });
}
