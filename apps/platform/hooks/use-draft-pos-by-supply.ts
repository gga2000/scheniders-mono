import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";
import { fetchPurchaseOrderLineCosts } from "@/lib/repositories/purchase-costs";

export interface DraftPoRef {
    id: string;
    number: string;
    /** How many of this supply the draft orders. */
    quantity: number;
    /** The draft's own price per unit; null when unknown or hidden from this member. */
    unitCost: number | null;
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
            // Line prices are cost data: read per draft (a store has few drafts), empty if hidden.
            const poIds = [...new Set(rows.flatMap((row) => {
                const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
                return po ? [po.id] : [];
            }))];
            const lineCosts = new Map<string, number | null>();
            for (const costs of await Promise.all(poIds.map(fetchPurchaseOrderLineCosts))) {
                for (const [lineId, cost] of costs) lineCosts.set(lineId, cost);
            }
            const map = new Map<string, DraftPoRef>();
            for (const row of rows) {
                const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
                if (!po) continue;
                const unitCost = lineCosts.get(row.id) ?? null;
                const seen = map.get(row.product_id);
                if (!seen) map.set(row.product_id, { id: po.id, number: po.po_number, quantity: row.quantity_ordered, unitCost });
                // A draft lists a supply once (one line per product); another draft's lines stay with that draft.
                else if (seen.id === po.id) seen.quantity += row.quantity_ordered;
            }
            return map;
        },
    });
}

/**
 * Supplier names compare the way the one-draft-per-supplier index does:
 * lower(btrim(name)). btrim strips only plain spaces, unlike String.trim.
 */
export function supplierKey(name: string): string {
    return name.replace(/^ +| +$/g, "").toLowerCase();
}

/**
 * Each supplier's draft PO, by supplierKey. A supplier has at most one draft,
 * and creating a PO for that supplier adds to it, so the reorder drawer names
 * it even when none of the draft's own supplies is low any more.
 */
export function useDraftPoBySupplier() {
    const { tenantId } = useAuth();
    return useQuery({
        // Under the same key prefix, so every invalidation of the drafts refreshes it.
        queryKey: ["draft-pos-by-supply", tenantId, "by-supplier"],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, Omit<DraftPoRef, "quantity" | "unitCost">>> => {
            if (!tenantId) return new Map();
            const rows = await fetchAllPages<{ id: string; po_number: string; supplier_name: string | null }>((from, to) =>
                supabase
                    .from("purchase_orders")
                    .select("id, po_number, supplier_name")
                    .eq("tenant_id", tenantId)
                    .eq("status", "draft")
                    .order("id")
                    .range(from, to)
            );
            const map = new Map<string, Omit<DraftPoRef, "quantity" | "unitCost">>();
            for (const row of rows) {
                if (row.supplier_name) map.set(supplierKey(row.supplier_name), { id: row.id, number: row.po_number });
            }
            return map;
        },
    });
}
