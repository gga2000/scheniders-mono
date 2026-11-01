import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";
import { fetchPurchaseOrderCosts } from "@/lib/repositories/purchase-costs";

export interface SupplierPoRow {
    id: string;
    po_number: string;
    status: string;
    expected_date: string | null;
    received_at: string | null;
    total_cost: number | null;
    created_at: string | null;
    supplier_name: string | null;
    supplier_contact: string | null;
    supplier_email: string | null;
}

/**
 * Pulls the tenant's purchase orders for supplier-level roll-ups
 * (YTD spend, last-order, open PO count).
 */
export function useSupplierPos() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["supplier-pos", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<SupplierPoRow[]> => {
            if (!tenantId) return [];
            // The API silently stops at 1000 rows; YTD spend must see every PO.
            const data = await fetchAllPages<Omit<SupplierPoRow, "total_cost">>((from, to) =>
                supabase
                    .from("purchase_orders")
                    .select(
                        "id, po_number, status, expected_date, received_at, created_at, supplier_name, supplier_contact, supplier_email"
                    )
                    .eq("tenant_id", tenantId)
                    .order("created_at", { ascending: false })
                    .order("id")
                    .range(from, to)
            );
            // total_cost is not a readable column; only members who may see
            // cost get it, everyone else sees it as unknown.
            const costs = await fetchPurchaseOrderCosts(tenantId);
            return data.map((po) => ({ ...po, total_cost: costs.get(po.id) ?? null }));
        },
    });
}
