"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface StoreAnalytics {
    orderCount: number;
    revenue: number;
    topProduct: string | null;
}

export function useStoreAnalytics(tenantId: string) {
    return useQuery<StoreAnalytics>({
        queryKey: ["store-analytics", tenantId],
        queryFn: async () => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const since = sevenDaysAgo.toISOString();

            // Fetch order count and revenue
            const { data: orders } = await supabase
                .from("orders")
                .select("id, total_amount")
                .eq("tenant_id", tenantId)
                .gte("created_at", since);

            const orderCount = orders?.length || 0;
            const revenue = orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

            // Fetch top product (most ordered in last 7 days)
            let topProduct: string | null = null;
            const { data: items } = await supabase
                .from("order_items")
                .select("product_name, quantity, order_id")
                .in(
                    "order_id",
                    (orders || []).map((o) => o.id)
                );

            if (items && items.length > 0) {
                const counts: Record<string, number> = {};
                for (const item of items) {
                    const name = item.product_name || "Unknown";
                    counts[name] = (counts[name] || 0) + (item.quantity || 1);
                }
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                topProduct = sorted[0]?.[0] || null;
            }

            return { orderCount, revenue, topProduct };
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
