import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderItem } from "@/types/order";
import { deductSupplies } from "@/lib/inventory-engine";

type OrderStatus = Order["status"];

/**
 * Reserved and physical stock for catalog products is moved by the `orders`
 * trigger; the effect below is the one the trigger does not cover (supplies).
 */

/** Statuses in which the order's supplies have already been used up. */
const FULFILLED_STATUSES: readonly OrderStatus[] = ["delivered", "completed"];

export type StatusSideEffect = "deduct_supplies";

/** The non-trigger inventory effect of moving an order from `from` to `to`, if any. */
export function statusSideEffect(from: OrderStatus, to: OrderStatus): StatusSideEffect | null {
    if (from === to) return null;
    // Fires on entering the group, not on moves inside it: delivered →
    // completed must not use the supplies twice.
    if (FULFILLED_STATUSES.includes(to) && !FULFILLED_STATUSES.includes(from)) return "deduct_supplies";
    return null;
}

/**
 * Run the side effect for one order's status change. Shared by the orders page
 * (browser client) and the MCP tools (a client carrying the user's token).
 */
export async function applyStatusSideEffect(
    db: SupabaseClient,
    change: { tenantId: string; items: OrderItem[]; from: OrderStatus; to: OrderStatus },
): Promise<{ success: boolean; error?: string }> {
    switch (statusSideEffect(change.from, change.to)) {
        case "deduct_supplies":
            return deductSupplies(change.items, change.tenantId, db);
        case null:
            return { success: true };
    }
}
