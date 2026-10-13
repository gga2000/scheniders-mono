"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { fetchAllPages } from "@/lib/analytics/dashboard-order-facts";
import {
    CHANNEL_FACT_COLUMNS,
    CHANNEL_FACT_COLUMNS_WITH_PRICE,
    calculateChannelPerformance,
    channelFactSchema,
    type ChannelPerformanceSummary,
} from "@/lib/analytics/channel-metrics";
import type { DateRange } from "@/hooks/use-reports-metrics";

/**
 * Revenue by ad channel for the report's date range, read from the server.
 *
 * The shared orders list is date-windowed, so a range wider than what it loaded
 * would undercount. This reads every order CREATED in the range — only the three
 * columns the card uses, every page — scoped to the active tenant (RLS enforces
 * the same) and filtered like `get_dashboard_metrics`: not archived, not deleted,
 * not an unfinished checkout. Returns are excluded too: a refund is not a second
 * acquisition.
 *
 * `price` is selected only for viewers entitled to money, so a viewer who may not
 * see revenue is never sent it.
 */
export function useChannelPerformance(dateRange: DateRange) {
    const { session, clientReady, tenantId } = useAuth();
    const { canReveal } = useFinancialVisibility();
    const from = dateRange.from.toISOString();
    const to = dateRange.to.toISOString();

    return useQuery<ChannelPerformanceSummary>({
        queryKey: ["reports", "channel-performance", tenantId, from, to, canReveal],
        queryFn: async () => {
            if (!tenantId) throw new Error("channel performance requested without a tenant");
            const columns = canReveal ? CHANNEL_FACT_COLUMNS_WITH_PRICE : CHANNEL_FACT_COLUMNS;
            const rows = await fetchAllPages(async (start, end) => {
                const { data, error } = await supabase
                    .from("orders")
                    .select(columns)
                    .eq("tenant_id", tenantId)
                    .eq("is_archived", false)
                    .is("deleted_at", null)
                    .neq("status", "pending_checkout")
                    .not("is_return", "is", true)
                    .gte("created_at", from)
                    .lte("created_at", to)
                    // A stable order is what makes offset paging complete.
                    .order("id", { ascending: true })
                    .range(start, end);
                if (error) throw error;
                return data ?? [];
            });
            return calculateChannelPerformance(channelFactSchema.array().parse(rows), canReveal);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        retry: 2,
    });
}
