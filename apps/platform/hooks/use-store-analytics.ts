"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { summarizeSales, type KpiOrderRow } from "@/lib/store-kpis";
import { storeHubWindow } from "@/lib/store-hub-window";

export interface StoreAnalytics {
    orderCount: number;
    revenue: number;
}

const PAGE = 1000;

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
            const rows = await fetchAllPages<KpiOrderRow>(async (offset) => {
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
                return { rows: (data ?? []) as KpiOrderRow[], total: count ?? 0 };
            });
            return summarizeSales(rows);
        },
        staleTime: 5 * 60 * 1000,
    });
}
