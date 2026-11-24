"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { financeSummaryKey, readFinanceSummary, type DayRange } from "@/lib/finance/summary-read";

export type { DayRange } from "@/lib/finance/summary-read";

/**
 * Every figure of the Finances summary for `range`, and the same figures for
 * `compare` (the period before it) when one is given. The database counts them
 * over the whole book (get_finance_summary, gated to members who may see the
 * shop's finances), so nothing here depends on which orders the browser holds.
 */
export function useFinanceSummary(range: DayRange, compare: DayRange | null) {
    const { tenantId } = useAuth();

    const current = useQuery({
        queryKey: financeSummaryKey(tenantId, range),
        enabled: Boolean(tenantId),
        staleTime: 60_000,
        // A new period keeps the old figures on screen until its own arrive.
        placeholderData: keepPreviousData,
        queryFn: () => readFinanceSummary(supabase, tenantId ?? "", range),
    });

    const previous = useQuery({
        queryKey: financeSummaryKey(tenantId, compare),
        enabled: Boolean(tenantId) && compare !== null,
        staleTime: 5 * 60_000,
        placeholderData: keepPreviousData,
        queryFn: () => readFinanceSummary(supabase, tenantId ?? "", compare ?? range),
    });

    return { current, previous: compare === null ? null : previous };
}
