import { supabase } from "@/lib/supabase";

export type ReturnDestination = "restock" | "open_box" | "write_off";

export interface ReturnItemDestination {
    product_id: string;
    quantity: number;
    dest: ReturnDestination;
}

export interface ProcessReturnInput {
    orderId: string;
    tenantId: string | null;
    reasonLabel: string;
    changedByName: string;
    changedByAvatar?: string | null;
    destinations: ReturnItemDestination[];
}

/**
 * Atomically reject the order with a reason and route each item's goods
 * (restock / open_box / write_off). Reservation release is handled by the
 * reserve-model trigger on the orders table.
 */
export async function processReturn(input: ProcessReturnInput): Promise<void> {
    const { error } = await supabase.rpc("process_return", {
        _order_id: input.orderId,
        _tenant_id: input.tenantId,
        _reason_label: input.reasonLabel,
        _changed_by_name: input.changedByName,
        _changed_by_avatar: input.changedByAvatar ?? null,
        _destinations: input.destinations,
    });
    if (error) throw error;
}

export async function undoReturn(orderId: string, tenantId: string | null): Promise<void> {
    const { error } = await supabase.rpc("undo_return", {
        _order_id: orderId,
        _tenant_id: tenantId,
    });
    if (error) throw error;
}
