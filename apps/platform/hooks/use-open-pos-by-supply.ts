import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { PoStatus, PoStatusInfo } from "@/components/products/supplies/po-status-chip";

/**
 * Fetches purchase orders that are still in-flight (draft/sent/confirmed) and maps
 * the soonest-arriving one per supply product_id. Used for the PO-status chip on
 * supply cards/rows so ops can see "PO #1234 arriving in 3d" at a glance.
 */
export function useOpenPosBySupply() {
    const { tenantId } = useAuth();

    return useQuery({
        queryKey: ["open-pos-by-supply", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, PoStatusInfo>> => {
            if (!tenantId) return new Map();

            const { data: pos, error } = await supabase
                .from("purchase_orders")
                .select("id, po_number, status, expected_date, received_at")
                .eq("tenant_id", tenantId)
                .in("status", ["draft", "sent", "confirmed"])
                .is("received_at", null);

            if (error) throw error;
            if (!pos || pos.length === 0) return new Map();

            const poIds = pos.map((p) => p.id);
            const { data: items, error: itemsError } = await supabase
                .from("purchase_order_items")
                .select("po_id, product_id, quantity_ordered, quantity_received")
                .in("po_id", poIds);

            if (itemsError) throw itemsError;

            const poById = new Map(pos.map((p) => [p.id, p]));
            const map = new Map<string, PoStatusInfo>();

            for (const item of items ?? []) {
                const po = poById.get(item.po_id);
                if (!po) continue;
                const outstanding =
                    (item.quantity_ordered ?? 0) - (item.quantity_received ?? 0);
                if (outstanding <= 0) continue;

                const info: PoStatusInfo = {
                    poNumber: po.po_number,
                    status: po.status as PoStatus,
                    expectedDate: po.expected_date,
                    quantity: outstanding,
                };

                const existing = map.get(item.product_id);
                if (!existing) {
                    map.set(item.product_id, info);
                    continue;
                }

                // Prefer the soonest arrival; null expected_date sorts last.
                const a = existing.expectedDate ? new Date(existing.expectedDate).getTime() : Infinity;
                const b = info.expectedDate ? new Date(info.expectedDate).getTime() : Infinity;
                if (b < a) map.set(item.product_id, info);
            }

            return map;
        },
    });
}
