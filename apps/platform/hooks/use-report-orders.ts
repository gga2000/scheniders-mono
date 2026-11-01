"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { fetchAllPages } from "@/lib/analytics/dashboard-order-facts";
import {
    REPORT_ORDER_COLUMNS,
    previousPeriod,
    reportOrderSchema,
    type ReportOrder,
    type ReportRange,
} from "@/lib/analytics/report-order-facts";

/**
 * Every order the report needs: created in the range or in the equal period
 * before it (for the comparisons). Tenant-scoped (RLS enforces the same), not
 * archived, not deleted, not an unfinished checkout, every page. Returns are
 * kept — the return card reads them — and split out by `splitReportOrders`.
 *
 * The reports route is admin-only, so `price` is always selected.
 */
export function useReportOrders(range: ReportRange) {
    const { session, clientReady, tenantId } = useAuth();
    const from = previousPeriod(range).from.toISOString();
    const to = range.to.toISOString();

    return useQuery<ReportOrder[]>({
        queryKey: ["reports", "orders", tenantId, from, to],
        queryFn: async () => {
            if (!tenantId) throw new Error("report orders requested without a tenant");
            const rows = await fetchAllPages(async (start, end) => {
                const { data, error } = await supabase
                    .from("orders")
                    .select(REPORT_ORDER_COLUMNS)
                    .eq("tenant_id", tenantId)
                    .eq("is_archived", false)
                    .is("deleted_at", null)
                    .neq("status", "pending_checkout")
                    .gte("created_at", from)
                    .lte("created_at", to)
                    // A stable order is what makes offset paging complete.
                    .order("id", { ascending: true })
                    .range(start, end);
                if (error) throw error;
                return data ?? [];
            });
            return reportOrderSchema.array().parse(rows);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        retry: 2,
    });
}
