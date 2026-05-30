import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

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
            const { data, error } = await supabase
                .from("purchase_orders")
                .select(
                    "id, po_number, status, expected_date, received_at, total_cost, created_at, supplier_name, supplier_contact, supplier_email"
                )
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },
    });
}
