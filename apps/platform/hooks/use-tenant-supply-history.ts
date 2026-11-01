import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";
import type { HistoryEntry } from "@/lib/utils/supply-forecasting";

interface SupplyHistoryRow {
    product_id: string;
    change_type: string;
    quantity_change: number;
    created_at: string;
}

/**
 * Batched inventory history for all supplies in one query so the actions feed
 * and inline sparklines don't fan out to N per-supply requests.
 * Scoped to the last 30 days, keyed by product_id.
 */
export function useTenantSupplyHistory(supplyIds: string[]) {
    const { tenantId } = useAuth();

    return useQuery({
        // The ids are not part of the key: the database already limits the rows to supplies.
        queryKey: ["tenant-supply-history", tenantId],
        enabled: !!tenantId && supplyIds.length > 0,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, HistoryEntry[]>> => {
            if (!tenantId) return new Map();
            // Supplies' rows only, read in pages: a whole-tenant read capped at 5000
            // rows silently dropped older supply movements once orders piled up.
            const rows = await fetchAllPages<SupplyHistoryRow>((from, to) =>
                supabase.rpc("supply_history_30d", { p_tenant_id: tenantId }).order("created_at", { ascending: false }).range(from, to)
            );
            const out = new Map<string, HistoryEntry[]>();
            for (const row of rows) {
                const entry: HistoryEntry = {
                    change_type: row.change_type,
                    quantity_change: row.quantity_change,
                    created_at: row.created_at,
                };
                const existing = out.get(row.product_id);
                if (existing) existing.push(entry);
                else out.set(row.product_id, [entry]);
            }
            return out;
        },
    });
}
