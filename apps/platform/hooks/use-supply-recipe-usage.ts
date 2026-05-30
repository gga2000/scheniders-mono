import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export interface RecipeUsageRow {
    productId: string;
    productName: string;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    unit: "per_order" | "per_item" | "per_unit";
}

/**
 * Reverse BOM lookup: which products (recipes) consume this supply and how.
 * Powers the supply detail drawer's "Recipe usage" tab.
 */
export function useSupplyRecipeUsage(supplyId: string | null, enabled: boolean = true) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["supply-recipe-usage", tenantId, supplyId],
        enabled: !!tenantId && !!supplyId && enabled,
        staleTime: 60_000,
        queryFn: async (): Promise<RecipeUsageRow[]> => {
            if (!tenantId || !supplyId) return [];
            const { data, error } = await supabase
                .from("bom_items")
                .select(
                    "product_id, quantity, unit, products:product_id(id, name, sku, image_url)"
                )
                .eq("tenant_id", tenantId)
                .eq("supply_id", supplyId);
            if (error) throw error;
            const rows: RecipeUsageRow[] = [];
            for (const r of data ?? []) {
                const p = (r as unknown as {
                    products?: {
                        id: string;
                        name: string;
                        sku: string | null;
                        image_url: string | null;
                    } | null;
                }).products;
                if (!p) continue;
                rows.push({
                    productId: p.id,
                    productName: p.name,
                    sku: p.sku,
                    imageUrl: p.image_url,
                    quantity: Number((r as { quantity: number }).quantity),
                    unit: (r as { unit: RecipeUsageRow["unit"] }).unit,
                });
            }
            rows.sort((a, b) => a.productName.localeCompare(b.productName));
            return rows;
        },
    });
}
