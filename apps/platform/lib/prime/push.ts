import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Order } from "@/types/order";
import { COURIER_SHEET_COLUMNS, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import { isPrimeUnreachable, PRIME_ERROR, PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import { buildPrimeShipment, primeShipmentHash, primeUpdateFields, type PrimeMerchant } from "@/lib/prime/shipment-payload";
import { PRIME_CANCEL_BY_HAND, PRIME_EDIT_REFUSED, primeTakesEdits, withAttention, withoutAttention } from "@/lib/prime/status-map";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Queue entries handled per tenant per run; the rest wait for the next run (5 minutes). */
const PUSH_BATCH = 100;
/** This many unreachable answers in a row and the rest of the queue waits for the next run. */
const DOWN_AFTER = 3;
/** A change Prime has not taken for this long is flagged for a person; it stays queued and is still sent. */
const STALE_MS = 60 * 60 * 1000;

type QueuedOrder = CourierSheetOrder &
    Pick<Order, "id" | "status" | "version" | "attention_reasons"> & { deleted_at: string | null };

type QueuedRow = {
    id: string;
    case_id: number;
    shipment_status: string | null;
    pushed_hash: string | null;
    push_needed_at: string | null;
    cancel_needed_at: string | null;
    orders: QueuedOrder;
};

export interface PrimePushOutcome {
    /** Edits Prime accepted. */
    updated: number;
    /** Queue entries that needed no call (nothing Prime holds changed, or Prime is done with the parcel). */
    unchanged: number;
    /** Shipments Prime deleted because the order was cancelled. */
    cancelled: number;
    /** Edits or cancellations Prime would not take; the order is flagged for a person. */
    refused: number;
    /** A person changed the order meanwhile; retried on the next run. */
    conflicts: number;
    /** Left queued because Prime could not be reached; sent on a later run. */
    deferred: number;
}

type OneResult = Exclude<keyof PrimePushOutcome, "deferred"> | "unreachable";

/**
 * Send staff changes to Prime: the queue the order trigger fills
 * (trg_orders_prime_queue). An edit to an order Prime still delivers
 * replaces the shipment's details; a cancelled or deleted order deletes the
 * shipment. What Prime will not take flags the order for a person. A queue
 * entry is cleared only if no newer change arrived while it was being sent,
 * so a change made mid-run goes out on the next one. Once Prime stops
 * answering, the rest of the queue waits for the next run; a change stuck
 * for an hour is flagged so a person can tell Prime by phone.
 */
export async function pushPrimeChanges(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
): Promise<PrimePushOutcome> {
    const { data, error } = await db
        .from("prime_shipments")
        .select(
            `id, case_id, shipment_status, pushed_hash, push_needed_at, cancel_needed_at, orders!inner(${COURIER_SHEET_COLUMNS}, status, version, attention_reasons, deleted_at)`,
        )
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .or("push_needed_at.not.is.null,cancel_needed_at.not.is.null")
        .limit(PUSH_BATCH);
    if (error) throw new Error(error.message);

    const outcome: PrimePushOutcome = { updated: 0, unchanged: 0, cancelled: 0, refused: 0, conflicts: 0, deferred: 0 };
    // Several in a row, not one: a single entry Prime answers with a server fault must not hold back the rest.
    let downInARow = 0;
    for (const row of data as unknown as QueuedRow[]) {
        if (downInARow >= DOWN_AFTER) {
            outcome.deferred += 1;
            continue;
        }
        const result = await pushOne(db, client, tenantId, merchant, row);
        if (result === "unreachable") {
            downInARow += 1;
            outcome.deferred += 1;
            await flagIfStale(db, tenantId, row);
        } else {
            downInARow = 0;
            outcome[result] += 1;
        }
    }
    return outcome;
}

async function pushOne(db: ServiceDb, client: PrimeClient, tenantId: string, merchant: PrimeMerchant, row: QueuedRow): Promise<OneResult> {
    const order = row.orders;
    const closedByStaff = order.status === "cancelled" || order.deleted_at != null;

    if (row.cancel_needed_at) {
        if (closedByStaff) return cancelOne(db, client, tenantId, row);
        // Reopened before the cancellation went out: nothing to delete, and nothing to cancel by hand.
        const unflagged = await writeAttention(db, tenantId, order, withoutAttention(order.attention_reasons, [PRIME_CANCEL_BY_HAND]));
        if (!unflagged) return "conflicts";
        await saveRow(db, row, { cancel_needed_at: null }, "cancel_needed_at");
        if (!row.push_needed_at) return "unchanged";
    }
    if (!row.push_needed_at) return "unchanged";

    // A closed order, or a parcel Prime has finished with (delivered, returned…), takes no edits.
    if (closedByStaff || !primeTakesEdits(order.status, row.shipment_status)) {
        await saveRow(db, row, { push_needed_at: null }, "push_needed_at");
        return "unchanged";
    }

    const built = buildPrimeShipment(order, merchant);
    if (!built.ok) {
        // The order now holds something Prime cannot take (an invalid phone, say): Prime keeps the old details.
        return refuse(db, tenantId, row, PRIME_EDIT_REFUSED, `skip:${built.reason}`, { push_needed_at: null }, "push_needed_at");
    }

    const fields = primeUpdateFields(built.payload);
    const hash = primeShipmentHash(fields);
    if (hash !== row.pushed_hash) {
        try {
            await client.updateShipment(Number(row.case_id), fields);
        } catch (err) {
            if (isPrimeUnreachable(err)) return "unreachable";
            return refuse(db, tenantId, row, PRIME_EDIT_REFUSED, errorText(err), { push_needed_at: null }, "push_needed_at");
        }
        await saveRow(db, row, { pushed_hash: hash, pushed_at: new Date().toISOString(), push_error: null }, null);
    }

    // Prime holds the order's current details: an earlier refusal no longer applies.
    const unflagged = await writeAttention(db, tenantId, order, withoutAttention(order.attention_reasons, [PRIME_EDIT_REFUSED]));
    if (!unflagged) return "conflicts";
    await saveRow(db, row, { push_needed_at: null, push_error: null }, "push_needed_at");
    return hash === row.pushed_hash ? "unchanged" : "updated";
}

async function cancelOne(db: ServiceDb, client: PrimeClient, tenantId: string, row: QueuedRow): Promise<OneResult> {
    try {
        await client.deleteShipment(Number(row.case_id));
    } catch (err) {
        if (isPrimeUnreachable(err)) return "unreachable";
        // Not found: already gone at Prime, which is what the cancellation wanted.
        if (!(err instanceof PrimeApiError && err.code === PRIME_ERROR.notFound)) {
            // Prime has the parcel (code 12) or refused otherwise: a person cancels it with Prime.
            return refuse(db, tenantId, row, PRIME_CANCEL_BY_HAND, errorText(err), {
                cancel_needed_at: null,
                push_needed_at: null,
                cancel_refused_at: new Date().toISOString(),
            }, "cancel_needed_at");
        }
    }
    // A cancellation that waited out an outage was flagged meanwhile; Prime has it now.
    const unflagged = await writeAttention(db, tenantId, row.orders, withoutAttention(row.orders.attention_reasons, [PRIME_CANCEL_BY_HAND]));
    if (!unflagged) return "conflicts";
    await saveRow(db, row, { cancelled_at: new Date().toISOString(), cancel_needed_at: null, push_needed_at: null, push_error: null }, "cancel_needed_at");
    return "cancelled";
}

/** An entry Prime could not be reached for, waiting over an hour: flag the order, keep it queued. */
async function flagIfStale(db: ServiceDb, tenantId: string, row: QueuedRow): Promise<void> {
    const cancelling = row.cancel_needed_at !== null;
    const since = cancelling ? row.cancel_needed_at : row.push_needed_at;
    if (!since || Date.now() - Date.parse(since) < STALE_MS) return;
    const reason = cancelling ? PRIME_CANCEL_BY_HAND : PRIME_EDIT_REFUSED;
    // A lost race is fine: the next run checks again.
    await writeAttention(db, tenantId, row.orders, withAttention(row.orders.attention_reasons, reason));
}

/** Flag the order, then record Prime's refusal and take the entry off the queue. A lost race leaves it queued. */
async function refuse(
    db: ServiceDb,
    tenantId: string,
    row: QueuedRow,
    reason: string,
    message: string,
    patch: Record<string, string | null>,
    guard: "push_needed_at" | "cancel_needed_at",
): Promise<OneResult> {
    const flagged = await writeAttention(db, tenantId, row.orders, withAttention(row.orders.attention_reasons, reason));
    if (!flagged) return "conflicts";
    await saveRow(db, row, { ...patch, push_error: message.slice(0, 500) }, guard);
    return "refused";
}

/** A version-guarded attention write; true when it landed or nothing needed writing. */
async function writeAttention(
    db: ServiceDb,
    tenantId: string,
    order: QueuedOrder,
    patch: { needs_attention: boolean; attention_reasons: string[] } | null,
): Promise<boolean> {
    if (!patch) return true;
    const { data, error } = await db
        .from("orders")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", order.id)
        .eq("version", order.version)
        .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
}

/**
 * Update the shipment row. With a guard, only while the queue timestamp is
 * still the one this run read: a newer change keeps the entry queued.
 */
async function saveRow(
    db: ServiceDb,
    row: QueuedRow,
    patch: Record<string, string | null>,
    guard: "push_needed_at" | "cancel_needed_at" | null,
): Promise<void> {
    let query = db.from("prime_shipments").update(patch).eq("id", row.id);
    if (guard && row[guard]) query = query.eq(guard, row[guard]);
    const { error } = await query;
    if (error) throw new Error(error.message);
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
