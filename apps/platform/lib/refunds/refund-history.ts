import type { OrderItem } from "@/types/order";
import { paidLines, type LineRefundHistory } from "./refund-math";

/** A refund or replacement already made against the original order. */
export interface AfterSaleChild {
    id: string;
    status: string;
    items: OrderItem[] | null;
}

/** An after_sale_items row taking units back from an original line. */
export interface BackLine {
    order_id: string;
    original_line_index: number;
    qty: number;
    amount: number;
}

/** Children that never took anything back: called off, or the refund failed. */
const DEAD_STATUSES = new Set(["cancelled", "refund_failed", "rejected"]);

const lineKey = (item: OrderItem) =>
    item.variant_id || item.product_id || item.name;

/**
 * What has already been taken back from each original line, the way
 * create_after_sale_order counts it: rows in after_sale_items, plus, for
 * children made before that table, the child's own items matched to a line by
 * variant, product or name and valued at that line's unit share.
 */
export function refundHistory(
    items: OrderItem[],
    orderPrice: number,
    children: AfterSaleChild[],
    backLines: BackLine[],
): LineRefundHistory[] {
    const live = children.filter((c) => !DEAD_STATUSES.has(c.status));
    const liveIds = new Set(live.map((c) => c.id));
    const history: LineRefundHistory[] = backLines
        .filter((b) => liveIds.has(b.order_id))
        .map((b) => ({ index: b.original_line_index, quantity: b.qty, amount: b.amount }));

    const withRows = new Set(backLines.map((b) => b.order_id));
    const lines = paidLines(items, orderPrice);
    const taken = lines.map((l) => history.filter((h) => h.index === l.index).reduce((s, h) => s + h.quantity, 0));

    for (const child of live) {
        if (withRows.has(child.id)) continue;
        for (const childItem of child.items ?? []) {
            const index = items.findIndex((item) => lineKey(item) === lineKey(childItem));
            if (index < 0) continue;
            const line = lines[index];
            const qty = Math.min(Math.max(0, Math.round(Number(childItem.quantity) || 0)), line.quantity - taken[index]);
            if (qty <= 0) continue;
            taken[index] += qty;
            history.push({ index, quantity: qty, amount: Math.round((line.paid * qty) / line.quantity) });
        }
    }
    return history;
}
