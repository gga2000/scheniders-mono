import type { Order } from "@/types/order";

type ReportedOrder = Pick<Order, "is_return" | "status" | "created_at" | "updated_at">;

/** A row that carries refunded money rather than a sale. */
export function isRefundRow(o: ReportedOrder): boolean {
    return Boolean(o.is_return) || o.status === "refund_delivered";
}

/**
 * When the customer was paid back, or null while the refund is still open or
 * failed. A refund row's last status change is reaching refund_delivered, so
 * its updated_at is the payment time (a later edit of the row moves it).
 */
export function refundPaidAt(o: ReportedOrder): Date | null {
    if (o.status !== "refund_delivered") return null;
    return new Date(o.updated_at || o.created_at);
}

/**
 * The date a finance report files an order under: a sale on the day it was
 * placed, a refund on the day the money went back. Open and failed refunds
 * have moved no money yet, so they are filed nowhere.
 */
export function reportDate(o: ReportedOrder): Date | null {
    return isRefundRow(o) ? refundPaidAt(o) : new Date(o.created_at);
}
