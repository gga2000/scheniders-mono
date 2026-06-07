import type { Order } from "@/types/order";

/**
 * How a scanned/typed order looks when it lands in the returns pile.
 *  - needs_action: a legitimate return to process (was shipped, not yet closed out).
 *  - done:         already processed in this session.
 *  - anomaly:      shouldn't be in a fresh return pile (already closed out / refunded).
 *  - not_found:    no order matched the scanned reference.
 *  - never_shipped: order never left, so a physical return is suspicious.
 */
export type ScanResult = "needs_action" | "done" | "anomaly" | "not_found" | "never_shipped";

// Terminal = already closed out; finding one in a fresh return pile is an anomaly.
// NOTE: `delivered` is intentionally NOT terminal — a delivered package physically
// coming back is the *core* return/refund case and must be processable. Likewise
// `return_pending` and `suspended` fall through to needs_action.
const TERMINAL: Order["status"][] = ["rejected", "cancelled", "refund_delivered", "refund_failed", "completed"];

// Pre-ship = never shipped, so a physical return is suspicious.
const PRESHIP: Order["status"][] = ["new", "contacted", "pending_checkout", "no_response"];

/**
 * Classify a resolved order for the returns cockpit.
 *
 * A delivered order whose money hasn't been returned yet (refund_status none/pending/failed)
 * is the everyday return/refund case → needs_action. Only flag it once the refund has
 * actually completed (refund_status 'refunded' or a terminal refund status), which means
 * the return was already processed and re-scanning is a duplicate.
 */
export function classifyScannedOrder(order: Pick<Order, "status" | "refund_status"> | null): ScanResult {
    if (!order) return "not_found";
    // Money already returned → the return was processed; re-scanning is a duplicate/anomaly.
    if (order.refund_status === "refunded") return "anomaly";
    if (TERMINAL.includes(order.status)) return "anomaly";
    if (PRESHIP.includes(order.status)) return "never_shipped";
    return "needs_action";
}
