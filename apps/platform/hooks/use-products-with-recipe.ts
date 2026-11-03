import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";

/** Ids of the store's products that have a recipe (at least one bom_items row). */
export function useProductsWithRecipe() {
    const { tenantId } = useAuth();
    return useQuery({
        // Under the recipe-uses prefix, so a recipe save refreshes it too.
        queryKey: ["supply-recipe-uses", tenantId, "products-with-recipe"],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<Set<string>> => {
            if (!tenantId) return new Set();
            const rows = await fetchAllPages<{ product_id: string }>((from, to) =>
                supabase.from("bom_items").select("product_id").eq("tenant_id", tenantId).order("id").range(from, to),
            );
            return new Set(rows.map((r) => r.product_id));
        },
    });
}
