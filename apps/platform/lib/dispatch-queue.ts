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

/**
 * Packing groups of the desk, in the order the team packs them: one group per
 * product shared by two or more one-piece orders (biggest first), the remaining
 * one-piece orders, orders with more than one piece (two of a product, or
 * several products), replacements, then refunds. Labels print in this order so each group comes off the printer
 * together.
 */
export type PackKind = "item" | "single" | "multi" | "replacement" | "refund";

export interface PackGroup<T> {
    /** Stable id: `item:<product>` or the kind. */
    key: string;
    kind: PackKind;
    /** The product name of an `item` group. */
    item?: string;
    orders: T[];
}

type PackInput = Pick<Order, "items" | "is_return" | "is_replacement">;

/** Exactly one piece puts an order in that product's group; any more is a multi-piece order. */
export function packKey(order: PackInput): { kind: Exclude<PackKind, "single">; item?: string } {
    if (order.is_return) return { kind: "refund" };
    if (order.is_replacement) return { kind: "replacement" };
    const lines = mergeOrderItems(order.items);
    const pieces = lines.reduce((sum, line) => sum + (line.quantity ?? 1), 0);
    if (lines.length === 1 && pieces === 1) return { kind: "item", item: lines[0].name };
    return { kind: "multi" };
}

const KIND_RANK: Record<PackKind, number> = { item: 0, single: 1, multi: 2, replacement: 3, refund: 4 };

/** The queue split into packing groups; orders keep their incoming order inside a group. */
export function groupForPacking<T extends PackInput>(orders: readonly T[]): PackGroup<T>[] {
    const groups = new Map<string, PackGroup<T>>();
    for (const order of orders) {
        const { kind, item } = packKey(order);
        const key = kind === "item" ? `item:${item}` : kind;
        const group = groups.get(key) ?? { key, kind, item, orders: [] };
        group.orders.push(order);
        groups.set(key, group);
    }
    // A product only one order asks for is not a group: those orders pack together.
    const singles: PackGroup<T> = { key: "single", kind: "single", orders: [] };
    for (const [key, group] of groups) {
        if (group.kind === "item" && group.orders.length < 2) {
            singles.orders.push(...group.orders);
            groups.delete(key);
        }
    }
    if (singles.orders.length > 0) groups.set(singles.key, singles);
    return [...groups.values()].sort(
        (a, b) =>
            KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
            b.orders.length - a.orders.length ||
            (a.item ?? "").localeCompare(b.item ?? "", "ar")
    );
}
