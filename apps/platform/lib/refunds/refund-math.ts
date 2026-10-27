import type { OrderItem } from "@/types/order";

/**
 * Refund money rules, client side. The database computes the same numbers
 * when the refund is created and never trusts these; this module exists so
 * the refund sheet shows the exact amount before anyone confirms.
 *
 * All amounts are whole IQD.
 *
 * What the customer paid for a line: the order's `price` (items minus any
 * order discount) is spread across lines by line value and rounded, with the
 * last line taking the rounding, so a full refund of every line equals the
 * order's price exactly. A partial quantity of a line is refunded at its
 * share of that line, and refunding the last units of a line refunds
 * whatever is left of it, so repeated partial refunds never drift.
 */

export interface PaidLine {
    /** Index into the original order's `items`. */
    index: number;
    name: string;
    quantity: number;
    /** What the customer paid for the whole line, whole IQD. */
    paid: number;
}

/** Units and money already refunded (or in progress) against one original line. */
export interface LineRefundHistory {
    index: number;
    quantity: number;
    amount: number;
}

export interface RefundableLine extends PaidLine {
    refundedQuantity: number;
    refundedAmount: number;
    remainingQuantity: number;
}

export interface RefundSelection {
    index: number;
    quantity: number;
}

export interface RefundPreview {
    lines: Array<{ index: number; name: string; quantity: number; amount: number }>;
    itemsTotal: number;
    deductions: number;
    customerReceives: number;
}

const lineValue = (item: OrderItem): number =>
    Math.max(0, Number(item.price) || 0) * Math.max(0, Math.round(Number(item.quantity) || 0));

export function paidLines(items: OrderItem[], orderPrice: number): PaidLine[] {
    const paidTotal = Math.max(0, Math.round(orderPrice));
    const values = items.map(lineValue);
    const valueTotal = values.reduce((sum, v) => sum + v, 0);
    let allocated = 0;
    return items.map((item, index) => {
        const isLast = index === items.length - 1;
        const paid = isLast
            ? paidTotal - allocated
            : valueTotal === 0
                ? 0
                : Math.round((paidTotal * values[index]) / valueTotal);
        allocated += paid;
        return {
            index,
            name: item.name,
            quantity: Math.max(0, Math.round(Number(item.quantity) || 0)),
            paid,
        };
    });
}

export function refundableLines(
    items: OrderItem[],
    orderPrice: number,
    history: LineRefundHistory[],
): RefundableLine[] {
    return paidLines(items, orderPrice).map((line) => {
        const past = history.filter((h) => h.index === line.index);
        const refundedQuantity = past.reduce((sum, h) => sum + h.quantity, 0);
        const refundedAmount = past.reduce((sum, h) => sum + h.amount, 0);
        return {
            ...line,
            refundedQuantity,
            refundedAmount,
            remainingQuantity: Math.max(0, line.quantity - refundedQuantity),
        };
    });
}

export function lineRefundAmount(line: RefundableLine, quantity: number): number {
    if (quantity <= 0 || line.quantity === 0) return 0;
    if (quantity >= line.remainingQuantity) return line.paid - line.refundedAmount;
    return Math.round((line.paid * quantity) / line.quantity);
}

export function previewRefund(
    lines: RefundableLine[],
    selection: RefundSelection[],
    deductions: number,
): RefundPreview {
    const chosen = selection
        .map((s) => {
            const line = lines.find((l) => l.index === s.index);
            if (!line) return null;
            const quantity = Math.min(Math.max(0, Math.round(s.quantity)), line.remainingQuantity);
            return { index: line.index, name: line.name, quantity, amount: lineRefundAmount(line, quantity) };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null && l.quantity > 0);
    const itemsTotal = chosen.reduce((sum, l) => sum + l.amount, 0);
    const kept = Math.min(Math.max(0, Math.round(deductions)), itemsTotal);
    return { lines: chosen, itemsTotal, deductions: kept, customerReceives: itemsTotal - kept };
}
