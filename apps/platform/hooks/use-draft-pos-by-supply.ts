import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";

export interface DraftPoRef {
    id: string;
    number: string;
    /** How many of this supply the draft orders. */
    quantity: number;
}

interface DraftLineRow {
    id: string;
    product_id: string;
    quantity_ordered: number;
    /** A to-one embed: an object at runtime; the untyped client infers a list. */
    purchase_orders: { id: string; po_number: string } | { id: string; po_number: string }[] | null;
}

/**
 * The draft purchase order each supply is on, by supply id, read from the
 * draft's own lines. A supplier's draft says nothing about that supplier's
 * other supplies: only the ones it lists are "already on a draft".
 */
export function useDraftPosBySupply() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["draft-pos-by-supply", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, DraftPoRef>> => {
            if (!tenantId) return new Map();
            const rows = await fetchAllPages<DraftLineRow>((from, to) =>
                supabase
                    .from("purchase_order_items")
                    .select("id, product_id, quantity_ordered, purchase_orders!inner(id, po_number)")
                    .eq("purchase_orders.tenant_id", tenantId)
                    .eq("purchase_orders.status", "draft")
                    .order("id")
                    .range(from, to)
            );
            const map = new Map<string, DraftPoRef>();
            for (const row of rows) {
                const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
                if (!po) continue;
                const seen = map.get(row.product_id);
                if (!seen) map.set(row.product_id, { id: po.id, number: po.po_number, quantity: row.quantity_ordered });
                // The same draft may list a supply twice; another draft's lines stay with that draft.
                else if (seen.id === po.id) seen.quantity += row.quantity_ordered;
            }
            return map;
        },
    });
}
