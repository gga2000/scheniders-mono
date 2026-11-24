import type { SupabaseClient } from "@supabase/supabase-js";
import { FinanceSummarySchema, type FinanceSummary } from "@/lib/finance/summary";

/** A run of Baghdad days, both ends included (YYYY-MM-DD). */
export interface DayRange {
    startDate: string;
    endDate: string;
}

/** One period's Finances summary in the query cache. */
export function financeSummaryKey(tenantId: string | null, range: DayRange | null) {
    return ["finance-summary", tenantId, range?.startDate ?? null, range?.endDate ?? null] as const;
}

/**
 * Every figure of the Finances summary for `range`, counted once in the
 * database over the whole book (get_finance_summary, gated to members who may
 * see the shop's finances) and read as the client's user. The browser hook and
 * the server's first-load read (lib/boot) both use it.
 */
export async function readFinanceSummary(client: SupabaseClient, tenantId: string, range: DayRange): Promise<FinanceSummary> {
    const { data, error } = await client.rpc("get_finance_summary", {
        _tenant_id: tenantId,
        _from: range.startDate,
        _to: range.endDate,
    });
    if (error) throw error;
    return FinanceSummarySchema.parse(data);
}
