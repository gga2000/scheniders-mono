"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { productKeys } from "@/hooks/use-products-query";

export interface ProductSales {
    timesSold: number;
    totalRevenue: number;
    averageOrderValue: number;
}

const EMPTY: ReadonlyMap<string, ProductSales> = new Map();

/**
 * Per-product sales totals, folded in SQL by `get_product_sales()`.
 *
 * These used to be folded in the browser over the shared order book. That book
 * is now windowed by the Orders page's date filter (today, by default), so on
 * /products every "times sold", revenue and best-seller figure silently
 * described whichever window the merchant last left Orders on. The RPC folds the
 * whole non-archived, non-deleted book instead, and also counts SKU-less lines
 * by name for products that have a SKU (the client fold dropped those).
 *
 * SECURITY INVOKER: RLS scopes both tables, and the function joins lines to
 * products on tenant_id. Rows are matched to products by id below, so a product
 * list scoped to the active tenant only ever picks up that tenant's rows.
 *
 * `averageOrderValue` divides by matched LINES, not orders — the same figure
 * the client fold produced.
 */
export function useProductSalesQuery(): ReadonlyMap<string, ProductSales> {
    const { session, clientReady } = useAuth();
    const { data } = useQuery({
        queryKey: [...productKeys.all, "sales"] as const,
        queryFn: async () => {
            const { data: rows, error } = await supabase.rpc("get_product_sales");
            if (error) throw error;
            const map = new Map<string, ProductSales>();
            for (const row of rows ?? []) {
                const timesSold = Number(row.times_sold) || 0;
                const totalRevenue = Number(row.total_revenue) || 0;
                const lines = Number(row.line_count) || 0;
                map.set(row.product_id, {
                    timesSold,
                    totalRevenue,
                    averageOrderValue: lines > 0 ? totalRevenue / lines : 0,
                });
            }
            return map;
        },
        enabled: !!session && clientReady,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? EMPTY;
}
