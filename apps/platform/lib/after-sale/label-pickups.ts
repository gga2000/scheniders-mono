import { z } from "zod";
import type { Order } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

/** What the courier takes back from the customer on one refund or replacement order. */
export interface AfterSalePickup {
    /** Order number of the sale this order undoes, e.g. "7616". */
    originalOrderNumber: string | null;
    /** Items to collect at the door; empty when the customer keeps everything. */
    items: { name: string; qty: number }[];
}

const rowSchema = z.object({
    order_id: z.string(),
    name: z.string(),
    qty: z.number(),
    expects_back: z.boolean(),
    original: z.object({ order_id: z.string() }).nullable(),
});

/**
 * Loads the pickup lines of the refund and replacement orders about to be
 * printed, keyed by order uuid. Orders created before the after-sale lines
 * existed have no rows and are left out, so the label falls back to the
 * order's own items. Row-level security keeps the read inside the tenant.
 */
export async function loadAfterSalePickups(orders: Order[]): Promise<Record<string, AfterSalePickup>> {
    const ids = orders.filter((o) => o.is_return || o.is_replacement).map((o) => o.id);
    if (ids.length === 0) return {};

    const { data, error } = await supabase
        .from("after_sale_items")
        .select("order_id, name, qty, expects_back, original:orders!after_sale_items_original_order_id_fkey(order_id)")
        .in("order_id", ids)
        .eq("direction", "back")
        .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = z.array(rowSchema).parse(data);
    const pickups: Record<string, AfterSalePickup> = {};
    for (const row of rows) {
        const pickup = (pickups[row.order_id] ??= { originalOrderNumber: row.original?.order_id ?? null, items: [] });
        if (row.expects_back) pickup.items.push({ name: row.name, qty: row.qty });
    }
    return pickups;
}
