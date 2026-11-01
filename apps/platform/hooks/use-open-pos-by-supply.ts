import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";
import { type PoStatus, type PoStatusInfo } from "@/components/products/supplies/po-status-chip";

/**
 * Outstanding quantity per product across open purchase orders (draft/sent/confirmed/partial),
 * with the soonest-arriving PO for the chip. Used for the PO-status chip on
 * supply cards/rows so ops can see "PO #1234 arriving in 3d" at a glance.
 */
interface OpenPoRow {
    product_id: string;
    quantity: number;
    po_number: string;
    status: string;
    expected_date: string | null;
}

export function useOpenPosBySupply() {
    const { tenantId } = useAuth();

    return useQuery({
        queryKey: ["open-pos-by-supply", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<Map<string, PoStatusInfo>> => {
            if (!tenantId) return new Map();

            // Summed in the database: the API stops at 1000 rows without an error,
            // which would make a supply look "not on order" and get double-bought.
            const rows = await fetchAllPages<OpenPoRow>((from, to) =>
                supabase.rpc("open_po_quantities", { p_tenant_id: tenantId }).order("product_id").range(from, to)
            );

            return new Map(
                rows.map((row) => [
                    row.product_id,
                    {
                        poNumber: row.po_number,
                        status: row.status as PoStatus,
                        expectedDate: row.expected_date,
                        quantity: Number(row.quantity),
                    },
                ])
            );
        },
    });
}
