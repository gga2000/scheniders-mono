import { type Order } from "@/types";

// =============================================
// AUTO NO-RESPONSE: CONTACTED → NO_RESPONSE (display only)
// =============================================
//
// The rule is owned by the database: pg_cron runs auto_move_to_no_response()
// every 10 minutes, so the status history and the activity feed credit "System".
//
// This file only makes the list read right in the gap between a contact going
// 48h stale and the next cron run. It never writes. It used to write the change
// back to the database from the browser, which credited the move to whoever had
// the page open and could overwrite a newer status (#7680, 2026-11-03).

const NO_RESPONSE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Show contacted orders whose last contact is older than 48h as no_response.
 * Pure: the database change is made by the server job.
 */
export function resolveStaleContacted(orders: Order[]): Order[] {
    const now = Date.now();

    return orders.map((order) => {
        if (order.status !== "contacted") return order;

        // Only use last_contacted_at — the precise timestamp of when
        // the customer was contacted. Skip orders without it.
        const contactedAt = order.last_contacted_at;
        if (!contactedAt) return order;

        const elapsed = now - new Date(contactedAt).getTime();
        if (elapsed <= NO_RESPONSE_THRESHOLD_MS) return order;

        return {
            ...order,
            status: "no_response" as Order["status"],
            updated_at: new Date().toISOString(),
        };
    });
}
