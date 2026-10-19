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
 * Lifetime sales per product, folded in SQL by `get_product_sales()`.
 *
 * The products page used to sum every order's `items` from the orders context.
 * That context is a WINDOW of the order book (the merchant's /orders date
 * filter, default one day), so "times sold", revenue, the best-seller card and
 * the sales sort silently reported whatever window /orders last loaded instead
 * of the product's history.
 *
 * The RPC is SECURITY INVOKER, so RLS scopes both orders and products to the
 * caller, and it joins lines to products on tenant_id, so a multi-tenant user's
 * products never match another tenant's lines. Results are keyed by product id
 * and only looked up for the products this tenant's product query returned.
 *
 * A line counts by SKU when it carries one, else by name — keyed off the LINE,
 * so giving a product a SKU later does not drop the lines recorded before it.
 *
 * `averageOrderValue` divides by matched lines, not orders, as the client fold
 * did before it.
 */
export function useProductSalesQuery(): ReadonlyMap<string, ProductSales> {
    const { session, clientReady, tenantId } = useAuth();
    const { data } = useQuery({
        // Keyed by tenant so switching tenant never shows the previous one's totals.
        queryKey: [...productKeys.all, "sales", tenantId] as const,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_product_sales");
            if (error) throw error;
            const map = new Map<string, ProductSales>();
            for (const row of data ?? []) {
                const timesSold = Number(row.times_sold);
                const totalRevenue = Number(row.total_revenue);
                const lines = Number(row.line_count);
                map.set(row.product_id, {
                    timesSold,
                    totalRevenue,
                    averageOrderValue: lines > 0 ? totalRevenue / lines : 0,
                });
            }
            return map;
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? EMPTY;
}
