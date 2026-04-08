import { type Order } from "@/types";
import { orderRepository } from "@/lib/repositories/order-repository";
import { diag } from "@/lib/diag";

// =============================================
// AUTO NO-RESPONSE: CONTACTED → NO_RESPONSE
// =============================================
//
// Two-layer enforcement:
//
// Layer 1 — FETCH-TIME RESOLUTION (instant, deterministic)
//   resolveStaleContacted() runs inside fetchOrders() in
//   use-orders-query.ts. It patches the data BEFORE it
//   enters React Query cache, so the UI always starts with
//   correct statuses. Zero flicker, zero delay.
//
//   Triggers automatically on:
//   • Initial load
//   • Window refocus (React Query refetchOnWindowFocus)
//   • Realtime reconnect
//   • App reopen (useAppLifecycle)
//
// Layer 2 — LAZY DB SYNC (fire-and-forget)
//   After resolving client-side, a background DB update
//   syncs for other users, analytics, and exports.
//   If it fails, the next fetch retries automatically.
//
// Cost: One extra date comparison per contacted order
// during an already-happening fetch. Effectively free.
//
// =============================================

const NO_RESPONSE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Fetch-time resolution.
 * Called inside fetchOrders() BEFORE data enters React Query cache.
 * Returns patched array + fires lazy DB sync for any stale orders.
 */
export function resolveStaleContacted(orders: Order[]): Order[] {
    const now = Date.now();
    const staleIds: string[] = [];

    const resolved = orders.map((order) => {
        if (order.status !== "contacted") return order;

        // Only use last_contacted_at — the precise timestamp of when
        // the customer was contacted. Skip orders without it.
        const contactedAt = order.last_contacted_at;
        if (!contactedAt) return order;

        const elapsed = now - new Date(contactedAt).getTime();
        if (elapsed <= NO_RESPONSE_THRESHOLD_MS) return order;

        staleIds.push(order.id);
        return {
            ...order,
            status: "no_response" as Order["status"],
            updated_at: new Date().toISOString(),
        };
    });

    // Lazy DB sync (fire-and-forget, non-blocking)
    if (staleIds.length > 0) {
        diag.log(
            `[AutoNoResponse] Resolved ${staleIds.length} stale contacted orders → no_response`
        );
        syncStaleOrdersToDb(staleIds);
    }

    return resolved;
}

/**
 * Background DB sync so other users, reports, and exports
 * see the correct status. If it fails, next fetch retries.
 */
async function syncStaleOrdersToDb(orderIds: string[]): Promise<void> {
    try {
        const { successfulOperations, failedOperations } =
            await orderRepository.bulkUpdateStatus(orderIds, "no_response");

        diag.log(
            `[AutoNoResponse] DB sync done. Updated: ${successfulOperations.length}, Failed: ${failedOperations.length}`
        );

        if (failedOperations.length > 0) {
            console.warn("[AutoNoResponse] Failed to sync:", failedOperations);
        }
    } catch (err) {
        console.error("[AutoNoResponse] DB sync failed (will retry next fetch):", err);
    }
}
