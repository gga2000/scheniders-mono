import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { HistoryEntry } from "@/lib/utils/supply-forecasting";

/**
 * Batched inventory history for all supplies in one query so the actions feed
 * and inline sparklines don't fan out to N per-supply requests.
 * Scoped to the last 30 days, keyed by product_id.
 */
export function useTenantSupplyHistory(supplyIds: string[]) {
    const { tenantId } = useAuth();
    const key = supplyIds.slice().sort().join(",");

    return useQuery({
        queryKey: ["tenant-supply-history", tenantId, key],
        enabled: !!tenantId && supplyIds.length > 0,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, HistoryEntry[]>> => {
            if (!tenantId || supplyIds.length === 0) return new Map();
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from("inventory_history")
                .select("product_id, change_type, quantity_change, created_at")
                .eq("tenant_id", tenantId)
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(5000);
            if (error) throw error;

            const allowed = new Set(supplyIds);
            const out = new Map<string, HistoryEntry[]>();
            for (const row of data ?? []) {
                const pid = (row as { product_id: string }).product_id;
                if (!allowed.has(pid)) continue;
                const existing = out.get(pid);
                const entry: HistoryEntry = {
                    change_type: row.change_type,
                    quantity_change: row.quantity_change,
                    created_at: row.created_at,
                };
                if (existing) existing.push(entry);
                else out.set(pid, [entry]);
            }
            return out;
        },
    });
}
