"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import {
    NON_SALE_STATUSES,
    RECENT_SALES_WINDOW_DAYS,
    linesFromOrderItems,
    type RecentSaleLine,
} from "@/lib/product-recent-sales";

const PAGE_SIZE = 1000;

/**
 * Order lines from the last RECENT_SALES_WINDOW_DAYS days for the current tenant,
 * used to rank the new-order product picker by recent top sellers. Reads only the
 * `items` column (RLS + explicit tenant filter), and only while `enabled`.
 */
export function useRecentOrderLines(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery<RecentSaleLine[]>({
        queryKey: ["orders", "recent-lines", tenantId, RECENT_SALES_WINDOW_DAYS],
        enabled: enabled && !!tenantId,
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            if (!tenantId) return [];
            const since = new Date(Date.now() - RECENT_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
            const rows: Array<{ items: unknown }> = [];
            for (let from = 0; ; from += PAGE_SIZE) {
                const { data, error } = await supabase
                    .from("orders")
                    .select("items")
                    .eq("tenant_id", tenantId)
                    .eq("is_archived", false)
                    .is("deleted_at", null)
                    .not("status", "in", `(${NON_SALE_STATUSES.join(",")})`)
                    .gte("created_at", since)
                    .order("id")
                    .range(from, from + PAGE_SIZE - 1);
                if (error) throw error;
                rows.push(...(data ?? []));
                if (!data || data.length < PAGE_SIZE) break;
            }
            return linesFromOrderItems(rows);
        },
    });
}
