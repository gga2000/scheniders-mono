"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { productKeys } from "@/hooks/use-products-query";

export interface ProductSales {
    /** Units sold on delivered orders, net of delivered refunds. */
    timesSold: number;
    /** IQD earned on delivered orders, net of delivered refunds. */
    totalRevenue: number;
    /** Revenue per delivered order that carried the product, whole IQD. */
    averageOrderValue: number;
    timesSold30d: number;
    revenue30d: number;
}

const EMPTY: ReadonlyMap<string, ProductSales> = new Map();

/**
 * Per-product sales, folded in SQL by `get_product_sales(p_tenant_id)`.
 *
 * Lines are matched on their product_id, and only delivered orders count
 * (completed/delivered, minus delivered refunds) — the same rule the Customers
 * page uses for spend, so the two pages agree. Cancelled, rejected, no-answer
 * and in-flight orders are not sales. The RPC checks membership of the tenant.
 */
export function useProductSalesQuery(enabled = true): ReadonlyMap<string, ProductSales> {
    const { session, clientReady, tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: [...productKeys.all, "sales", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return EMPTY;
            const { data: rows, error } = await supabase.rpc("get_product_sales", { p_tenant_id: tenantId });
            if (error) throw error;
            const map = new Map<string, ProductSales>();
            for (const row of rows ?? []) {
                const totalRevenue = Number(row.revenue) || 0;
                const orders = Number(row.order_count) || 0;
                map.set(row.product_id, {
                    timesSold: Number(row.units_sold) || 0,
                    totalRevenue,
                    averageOrderValue: orders > 0 ? Math.round(totalRevenue / orders) : 0,
                    timesSold30d: Number(row.units_sold_30d) || 0,
                    revenue30d: Number(row.revenue_30d) || 0,
                });
            }
            return map;
        },
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? EMPTY;
}
