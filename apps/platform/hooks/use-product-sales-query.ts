"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";

export interface ProductSales {
    timesSold: number;
    totalRevenue: number;
    averageOrderValue: number;
}

const EMPTY: ReadonlyMap<string, ProductSales> = new Map();

interface ProductSalesRow {
    product_id: string;
    times_sold: number | string;
    total_revenue: number | string;
    line_count: number | string;
}

/**
 * PERF-D1. Per-product sales totals, folded in SQL.
 *
 * `use-products-crud` used to read the ENTIRE order book — ~7 MB even after
 * risk_data was split out — purely to sum every order's `items` array by
 * product. That made /products and every screen importing a product component a
 * full-book route. 40,972 order lines now collapse to 22 rows server-side.
 *
 * `averageOrderValue` divides by matched LINES, not orders. That is what the
 * client did; the name is inherited, not endorsed.
 */
export function useProductSalesQuery(): ReadonlyMap<string, ProductSales> {
    const { session, clientReady } = useAuth();
    const { data } = useQuery({
        queryKey: ["products", "sales"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_product_sales");
            if (error) throw error;
            const map = new Map<string, ProductSales>();
            for (const row of (data ?? []) as ProductSalesRow[]) {
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
