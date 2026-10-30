import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderItem } from "@/types/order";
import { deductSupplies, quarantineOrder, removeFromQuarantine } from "@/lib/inventory-engine";

type OrderStatus = Order["status"];

/**
 * Statuses an order rests in once it has left the active pipeline. Reserved and
 * physical stock for catalog products is moved by the `orders` trigger; the
 * effects below are the ones the trigger does not cover (supplies, the QC
 * queue).
 */
const TERMINAL_STATUSES: readonly OrderStatus[] = [
    "completed",
    "delivered",
    "rejected",
    "refund_delivered",
    "refund_failed",
    "cancelled",
];

const QUARANTINED_STATUSES: readonly OrderStatus[] = ["rejected", "refund_delivered", "cancelled"];

export type StatusSideEffect = "deduct_supplies" | "quarantine" | "unquarantine";

/** The non-trigger inventory effect of moving an order from `from` to `to`, if any. */
export function statusSideEffect(from: OrderStatus, to: OrderStatus): StatusSideEffect | null {
    if (from === to) return null;
    if (to === "completed" || to === "delivered") return "deduct_supplies";
    if (to === "rejected" || to === "refund_delivered") return "quarantine";
    const wasActive = !TERMINAL_STATUSES.includes(from);
    const isActive = !TERMINAL_STATUSES.includes(to);
    if (isActive && !wasActive && QUARANTINED_STATUSES.includes(from)) return "unquarantine";
    return null;
}

/**
 * Run the side effect for one order's status change. Shared by the orders page
 * (browser client) and the MCP tools (a client carrying the user's token).
 */
export async function applyStatusSideEffect(
    db: SupabaseClient,
    change: { orderId: string; tenantId: string; items: OrderItem[]; from: OrderStatus; to: OrderStatus; reason: string },
): Promise<{ success: boolean; error?: string }> {
    switch (statusSideEffect(change.from, change.to)) {
        case "deduct_supplies":
            return deductSupplies(change.items, change.tenantId, db);
        case "quarantine":
            return quarantineOrder(change.orderId, change.items, change.reason, change.tenantId, db);
        case "unquarantine":
            return removeFromQuarantine(change.orderId, change.tenantId, db);
        case null:
            return { success: true };
    }
}
