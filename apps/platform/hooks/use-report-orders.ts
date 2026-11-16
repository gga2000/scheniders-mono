"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { FACTS_PAGE_SIZE } from "@/lib/analytics/dashboard-order-facts";
import {
    REPORT_ORDER_COLUMNS,
    previousPeriod,
    reportOrderSchema,
    reportWindow,
    type ReportOrder,
    type ReportRange,
} from "@/lib/analytics/report-order-facts";

/**
 * Every order the report needs: arrived in the range or the equal period
 * before it (for the comparisons), or scheduled for one of their days, the
 * rule Orders and the dashboard use (splitReportOrders sorts them).
 * Tenant-scoped (RLS enforces the same), not archived, not deleted, not an unfinished checkout, every page. Returns are
 * kept — the return card reads them — and split out by `splitReportOrders`.
 *
 * The reports route is admin-only, so `price` is always selected.
 */
export function useReportOrders(range: ReportRange) {
    const { session, clientReady, tenantId } = useAuth();
    const prior = reportWindow(previousPeriod(range));
    const current = reportWindow(range);
    const from = new Date(prior.fromInstant).toISOString();
    const to = new Date(current.toInstant).toISOString();
    // Arrived in the two periods, or scheduled for one of their days.
    const inDays = `and(created_at.gte.${from},created_at.lte.${to}),and(scheduled_date.gte.${prior.fromDay},scheduled_date.lte.${current.toDay})`;

    return useQuery<ReportOrder[]>({
        queryKey: ["reports", "orders", tenantId, from, to],
        queryFn: async () => {
            if (!tenantId) throw new Error("report orders requested without a tenant");
            // One page with an exact count, then the remaining pages in parallel: a 60-day window
            // is several thousand rows, and fetching the pages one after another made the page wait
            // for the sum of every round trip.
            const fetchPage = async (start: number, end: number, withCount: boolean) => {
                const { data, error, count } = await supabase
                    .from("orders")
                    .select(REPORT_ORDER_COLUMNS, withCount ? { count: "exact" } : undefined)
                    .eq("tenant_id", tenantId)
                    .eq("is_archived", false)
                    .is("deleted_at", null)
                    // Stock taken in person is not a sale: Orders and the dashboard leave it out too.
                    .is("take_kind", null)
                    .neq("status", "pending_checkout")
                    .or(inDays)
                    // A stable order is what makes offset paging complete.
                    .order("id", { ascending: true })
                    .range(start, end);
                if (error) throw error;
                return { rows: data ?? [], count };
            };
            const first = await fetchPage(0, FACTS_PAGE_SIZE - 1, true);
            const rest: Promise<{ rows: unknown[] }>[] = [];
            for (let start = FACTS_PAGE_SIZE; start < (first.count ?? 0); start += FACTS_PAGE_SIZE) {
                rest.push(fetchPage(start, start + FACTS_PAGE_SIZE - 1, false));
            }
            const later = await Promise.all(rest);
            const rows = [first.rows, ...later.map(r => r.rows)].flat();
            return reportOrderSchema.array().parse(rows);
        },
        // Changing the range keeps the last report on screen (dimmed by the page) instead of
        // tearing the whole page down to a skeleton and closing the date picker.
        placeholderData: keepPreviousData,
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        refetchOnWindowFocus: true,
        retry: 2,
    });
}
