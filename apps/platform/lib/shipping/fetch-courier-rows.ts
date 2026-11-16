import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { COURIER_SHEET_COLUMNS } from "@/lib/shipping/courier-sheets";

/** Ids per read: keeps each request URL well under proxy limits. */
const CHUNK = 150;

/**
 * The orders a courier sheet is built from, read fresh by id (Fermi B4). The
 * orders list holds fewer columns than a sheet needs (no confirmed governorate,
 * no Prime district), and an export must carry what the order says now, not
 * what the list cached. Returned in the order of `ids`; a deleted or foreign
 * id is left out.
 */
export async function fetchCourierRows(tenantId: string, ids: readonly string[]): Promise<Order[]> {
    const byId = new Map<string, Order>();
    for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
            .from("orders")
            .select(COURIER_SHEET_COLUMNS)
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .in("id", ids.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as unknown as Order[]) byId.set(row.id, row);
    }
    return ids.map((id) => byId.get(id)).filter((o): o is Order => o !== undefined);
}
