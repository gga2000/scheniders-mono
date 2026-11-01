"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { isSaleOrder } from "@/lib/order-revenue";
import { storeHubWindow } from "@/lib/store-hub-window";
import type { Order } from "@/types/order";

export interface StoreAnalytics {
    orderCount: number;
    revenue: number;
}

const PAGE = 1000;

type OrderRow = Pick<Order, "status" | "is_return" | "price">;

/**
 * Orders placed and their value over the hub's 7-day window. Only real sales
 * count: refused / cancelled / abandoned checkouts and return rows are not
 * orders sold (lib/order-revenue), and a failed read throws instead of
 * showing a believable zero.
 */
export function useStoreAnalytics(tenantId: string) {
    return useQuery<StoreAnalytics>({
        queryKey: ["store-analytics", tenantId],
        queryFn: async () => {
            const { from } = storeHubWindow();
            const rows = await fetchAllPages<OrderRow>(async (offset) => {
                const { data, error, count } = await supabase
                    .from("orders")
                    .select("status, is_return, price", { count: "exact" })
                    .eq("tenant_id", tenantId)
                    .is("deleted_at", null)
                    .gte("created_at", from.toISOString())
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .range(offset, offset + PAGE - 1);
                if (error) throw error;
                return { rows: (data ?? []) as OrderRow[], total: count ?? 0 };
            });
            const sales = rows.filter(isSaleOrder);
            return {
                orderCount: sales.length,
                revenue: sales.reduce((sum, o) => sum + (o.price ?? 0), 0),
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}
