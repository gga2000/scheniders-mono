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
 * These used to be summed in the browser over the order list held by
 * OrdersProvider. That list is windowed to the merchant's date filter, so a
 * product's "times sold" silently meant "times sold inside whatever window the
 * orders page last had open". The client rule also picked SKU-or-name matching
 * from the PRODUCT, so giving a product a SKU discarded every historical line
 * recorded without one. The RPC keys the rule off the LINE (a line with a SKU
 * matches on SKU, a line without one on its name) over every non-archived,
 * non-deleted order. It is SECURITY INVOKER, so RLS scopes both tables, and it
 * joins on tenant_id so one tenant's products never match another's lines.
 *
 * `averageOrderValue` divides by matched lines, not orders, as the client did.
 */
export function useProductSalesQuery(): ReadonlyMap<string, ProductSales> {
    const { session, clientReady, tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: [...productKeys.all, "sales", tenantId] as const,
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
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? EMPTY;
}
