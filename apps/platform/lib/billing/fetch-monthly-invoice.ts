import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMonthlyInvoice, monthRange, type InvoiceTransaction, type MonthlyInvoice } from "./monthly-invoice";

const PAGE = 1000;
const COLUMNS = "type, amount_iqd, balance_after_iqd, description, reference_id, payment_method, created_at";

/**
 * Reads one Baghdad month of the tenant's wallet rows (RLS limits them to the
 * caller's own store) and sums them into an invoice. A busy month has more
 * rows than one PostgREST page, so it reads page by page.
 */
export async function fetchMonthlyInvoice(
    client: SupabaseClient,
    tenant: { id: string; displayId: number | null },
    month: string,
): Promise<MonthlyInvoice> {
    const { start, end } = monthRange(month);

    const [{ data: store, error: storeError }, { data: before, error: beforeError }] = await Promise.all([
        client.from("tenants").select("name").eq("id", tenant.id).single(),
        client
            .from("wallet_transactions")
            .select("balance_after_iqd")
            .eq("tenant_id", tenant.id)
            .lt("created_at", start)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (storeError) throw storeError;
    if (beforeError) throw beforeError;

    const transactions: InvoiceTransaction[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
            .from("wallet_transactions")
            .select(COLUMNS)
            .eq("tenant_id", tenant.id)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as InvoiceTransaction[];
        transactions.push(...rows);
        if (rows.length < PAGE) break;
    }

    return buildMonthlyInvoice({
        month,
        storeName: (store as { name: string }).name,
        displayId: tenant.displayId,
        transactions,
        openingBalance: before ? Number((before as { balance_after_iqd: number }).balance_after_iqd) : 0,
    });
}
