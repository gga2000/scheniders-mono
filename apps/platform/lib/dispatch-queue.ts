import { mergeOrderItems } from "@/lib/merge-order-items";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import type { Order } from "@/lib/supabase";

/** Why an order in the dispatch queue needs a second look before it ships. */
export interface QueueFlags {
    /** Already printed at least once. */
    reprint: boolean;
    /** Postponed to a later day: not today's shipment. */
    scheduledLater: boolean;
    missingPhone: boolean;
    missingAddress: boolean;
}

type FlagInput = Pick<Order, "print_count" | "scheduled_date" | "phone" | "address_details" | "city">;

export function getQueueFlags(order: FlagInput, now: number = Date.now()): QueueFlags {
    const { scheduledLater } = partitionByShipDay([order], now);
    return {
        reprint: (order.print_count ?? 0) > 0,
        scheduledLater: scheduledLater.length > 0,
        missingPhone: !order.phone?.trim(),
        missingAddress: !order.city?.trim() || !order.address_details?.trim(),
    };
}

export function hasBlockingFlag(flags: QueueFlags): boolean {
    return flags.missingPhone || flags.missingAddress;
}

export interface PickLine {
    key: string;
    name: string;
    quantity: number;
    orderCount: number;
}

type PickInput = Pick<Order, "items">;

/**
 * Total units to pull from the shelf for a set of orders, one line per
 * product + variant, biggest first. Split-per-unit lines are merged first so
 * three single-unit lines of one perfume count as 3, not as three products.
 */
export function buildPickList(orders: readonly PickInput[]): PickLine[] {
    const lines = new Map<string, PickLine>();
    for (const order of orders) {
        const seenInOrder = new Set<string>();
        for (const item of mergeOrderItems(order.items)) {
            const key = [item.product_id ?? item.sku ?? item.name, item.variant_id ?? "", item.is_open_box ? "open" : "new"].join("|");
            const line = lines.get(key) ?? { key, name: item.name, quantity: 0, orderCount: 0 };
            line.quantity += item.quantity;
            if (!seenInOrder.has(key)) {
                line.orderCount += 1;
                seenInOrder.add(key);
            }
            lines.set(key, line);
        }
    }
    return [...lines.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}
