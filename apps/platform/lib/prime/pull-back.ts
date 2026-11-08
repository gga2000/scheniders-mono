import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildStatusUpdate } from "@/lib/orders/status-update";
import { isPrimeUnreachable, PRIME_ERROR, PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import { primeReadyStatus } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Orders whose parcel can be taken back: sent, not delivered, not closed. */
const OPEN_STATUSES = new Set<string>(["confirmed", "return_pending", "in_transit"]);

export type PrimePullBackResult =
    | { ok: true }
    | { ok: false; reason: "not_sent" | "order_closed" | "already_picked_up" }
    | { ok: false; reason: "status_not_moved" }
    | { ok: false; reason: "prime_rejected" | "prime_unreachable"; message: string };

/**
 * Take a parcel back from Prime before Prime picks it up, keeping the order:
 * the shipment is deleted at Prime and our record of it removed, so the
 * dispatch desk sees the order as never sent and the next run hands it off
 * afresh, and the order moves back to where the desk picks it up (confirmed,
 * or return_pending for a refund). The status history trigger
 * records that move under `changedByName` (a service-role write has no
 * signed-in user of its own).
 *
 * Prime refuses once it has the parcel (code 12); nothing changes then and
 * the parcel has to be stopped with Prime by hand. A case Prime no longer
 * knows (4005) counts as taken back.
 */
export async function pullBackPrimeShipment(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    orderId: string,
    changedByName?: string,
): Promise<PrimePullBackResult> {
    const { data: row, error } = await db
        .from("prime_shipments")
        .select("id, case_id, cancelled_at")
        .eq("tenant_id", tenantId)
        .eq("order_id", orderId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.cancelled_at) return { ok: false, reason: "not_sent" };

    const { data: order, error: orderError } = await db
        .from("orders")
        .select("status, is_return")
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order || !OPEN_STATUSES.has(String(order.status))) return { ok: false, reason: "order_closed" };

    try {
        await client.deleteShipment(Number(row.case_id));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isPrimeUnreachable(err)) return { ok: false, reason: "prime_unreachable", message };
        if (err instanceof PrimeApiError && err.code === PRIME_ERROR.alreadyReceived) return { ok: false, reason: "already_picked_up" };
        if (!(err instanceof PrimeApiError && err.code === PRIME_ERROR.notFound)) return { ok: false, reason: "prime_rejected", message };
    }

    const { error: deleteError } = await db.from("prime_shipments").delete().eq("tenant_id", tenantId).eq("id", row.id);
    if (deleteError) throw new Error(deleteError.message);

    const ready = primeReadyStatus(order);
    if (order.status === ready) return { ok: true };
    const { data: moved, error: moveError } = await db
        .from("orders")
        .update(buildStatusUpdate(ready, { changedByName }))
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .eq("status", String(order.status))
        .select("id");
    if (moveError) throw new Error(moveError.message);
    return (moved?.length ?? 0) > 0 ? { ok: true } : { ok: false, reason: "status_not_moved" };
}
