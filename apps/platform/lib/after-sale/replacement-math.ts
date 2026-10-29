import { previewRefund, type RefundableLine, type RefundSelection } from "@/lib/refunds/refund-math";

/**
 * Replacement money, client side. create_after_sale_order computes the same
 * numbers when the replacement is created and never trusts these; this
 * module only lets the replace sheet show the exact courier amount first.
 *
 * All amounts are whole IQD.
 *
 *   credit         what the customer paid for the old items coming back
 *   newItemsTotal  catalogue price of the new items going out
 *   feeKept        delivery fee charged to the customer, 0 when the store
 *                  absorbs it (no cap: it is paid at the door, not deducted)
 *   courierAmount  newItemsTotal − credit + feeKept. Positive: the courier
 *                  collects it. Negative: the courier hands it to the customer.
 */

export interface ReplacementOutLine {
    /** Catalogue unit price, whole IQD. */
    price: number;
    quantity: number;
}

export interface ReplacementPreview {
    backLines: Array<{ index: number; name: string; quantity: number; amount: number }>;
    credit: number;
    newItemsTotal: number;
    feeKept: number;
    courierAmount: number;
}

export function previewReplacement(
    lines: RefundableLine[],
    selection: RefundSelection[],
    outLines: ReplacementOutLine[],
    fee: number,
    chargeFee: boolean,
): ReplacementPreview {
    const back = previewRefund(lines, selection, 0);
    const newItemsTotal = outLines.reduce(
        (sum, l) => sum + Math.max(0, Math.round(l.price)) * Math.max(0, Math.round(l.quantity)),
        0,
    );
    const feeKept = chargeFee ? Math.max(0, Math.round(fee)) : 0;
    return {
        backLines: back.lines,
        credit: back.itemsTotal,
        newItemsTotal,
        feeKept,
        courierAmount: newItemsTotal - back.itemsTotal + feeKept,
    };
}
