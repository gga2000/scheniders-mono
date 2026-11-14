"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { FinanceSummarySchema, type FinanceSummary } from "@/lib/finance/summary";

/** A run of Baghdad days, both ends included (YYYY-MM-DD). */
export interface DayRange {
    startDate: string;
    endDate: string;
}

async function fetchSummary(tenantId: string, range: DayRange): Promise<FinanceSummary> {
    const { data, error } = await supabase.rpc("get_finance_summary", {
        _tenant_id: tenantId,
        _from: range.startDate,
        _to: range.endDate,
    });
    if (error) throw error;
    return FinanceSummarySchema.parse(data);
}

/**
 * Every figure of the Finances summary for `range`, and the same figures for
 * `compare` (the period before it) when one is given. The database counts them
 * over the whole book (get_finance_summary, gated to members who may see the
 * shop's finances), so nothing here depends on which orders the browser holds.
 */
export function useFinanceSummary(range: DayRange, compare: DayRange | null) {
    const { tenantId } = useAuth();

    const current = useQuery({
        queryKey: ["finance-summary", tenantId, range.startDate, range.endDate],
        enabled: Boolean(tenantId),
        staleTime: 60_000,
        // A new period keeps the old figures on screen until its own arrive.
        placeholderData: keepPreviousData,
        queryFn: () => fetchSummary(tenantId ?? "", range),
    });

    const previous = useQuery({
        queryKey: ["finance-summary", tenantId, compare?.startDate ?? null, compare?.endDate ?? null],
        enabled: Boolean(tenantId) && compare !== null,
        staleTime: 5 * 60_000,
        placeholderData: keepPreviousData,
        queryFn: () => fetchSummary(tenantId ?? "", compare ?? range),
    });

    return { current, previous: compare === null ? null : previous };
}
