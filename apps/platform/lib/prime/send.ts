import * as Sentry from "@sentry/nextjs";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { COURIER_SHEET_COLUMNS, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import { isPrimeUnreachable, type PrimeClient } from "@/lib/prime/client";
import { buildPrimeShipment, primeReadyStatus, primeShipmentHash, primeUpdateFields, type PrimeMerchant, type PrimeSkipReason } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Why an order did not reach Prime through the API. Each one goes in the Excel file instead. */
export type PrimeSendFailure =
    | PrimeSkipReason
    | "not_found"
    | "not_confirmed"
    | "duplicate_receipt"
    | "prime_closed"
    | "prime_rejected"
    | "prime_unreachable";

export interface PrimeSendOutcome {
    sent: { orderId: string; caseId: number }[];
    /**
     * Not sent on purpose, not a failure: test orders (the guide's practice
     * orders) go nowhere.
     */
    skipped: { orderId: string; reason: "test_order" }[];
    failed: { orderId: string; reason: PrimeSendFailure; message?: string }[];
}

/** Shipments created at once; Prime answers each in ~0.3s. */
const CONCURRENCY = 4;
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** A case in one of these takes no parcel any more; a second hand-off is Prime's resend flow, not a new case. */
const CLOSED_STATUSES = new Set(["CNCL", "FAILED_DELIVER_RETURNED_TO_SENDER"]);

type SendableOrder = CourierSheetOrder & { id: string; status: string };
type OneResult = "sent" | "rejected" | "unreachable";

/**
 * Hand a dispatch run's orders to Prime, one shipment each. Orders already
 * sent are reported as sent again (a retried run never doubles a shipment);
 * Prime itself returns the same case for the same receipt within 12 hours.
 * Never throws for one order: every order ends up in `sent`, `skipped` or
 * `failed`. When a whole round of calls finds Prime unreachable, the rest of
 * the run is not attempted (it would only wait out the same timeouts).
 */
export async function sendOrdersToPrime(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    orderIds: string[],
): Promise<PrimeSendOutcome> {
    const outcome: PrimeSendOutcome = { sent: [], skipped: [], failed: [] };

    const [ordersRes, existingRes] = await Promise.all([
        db.from("orders").select(`${COURIER_SHEET_COLUMNS}, status`).eq("tenant_id", tenantId).in("id", orderIds),
        db.from("prime_shipments").select("order_id, case_id, shipment_status, cancelled_at").eq("tenant_id", tenantId).in("order_id", orderIds),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (existingRes.error) throw new Error(existingRes.error.message);

    const orders = new Map((ordersRes.data as unknown as SendableOrder[]).map((o) => [o.id, o]));
    const existing = new Map(
        existingRes.data.map((r) => [
            r.order_id as string,
            { caseId: Number(r.case_id), status: (r.shipment_status as string | null) ?? null, cancelled: r.cancelled_at != null },
        ]),
    );

    const toSend: SendableOrder[] = [];
    for (const id of orderIds) {
        const order = orders.get(id);
        const sent = existing.get(id);
        if (sent?.cancelled) {
            // The order was cancelled and Prime deleted the case; re-shipping it is a new hand-off a person makes.
            outcome.failed.push({ orderId: id, reason: "prime_closed", message: `Prime case ${sent.caseId} was deleted when the order was cancelled` });
        } else if (sent && sent.status && CLOSED_STATUSES.has(sent.status)) {
            outcome.failed.push({ orderId: id, reason: "prime_closed", message: `Prime case ${sent.caseId} is ${sent.status}` });
        } else if (sent) outcome.sent.push({ orderId: id, caseId: sent.caseId });
        else if (!order) outcome.failed.push({ orderId: id, reason: "not_found" });
        else if (order.is_test) outcome.skipped.push({ orderId: id, reason: "test_order" });
        // The desk ships confirmed orders (refunds: return_pending) and moves them to in transit afterwards.
        else if (order.status !== primeReadyStatus(order)) outcome.failed.push({ orderId: id, reason: "not_confirmed" });
        else toSend.push(order);
    }

    let primeDown: unknown = null;
    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
        const chunk = toSend.slice(i, i + CONCURRENCY);
        if (primeDown) {
            for (const order of chunk) outcome.failed.push({ orderId: order.id, reason: "prime_unreachable", message: "Prime stopped answering earlier in this run" });
            continue;
        }
        const results = await Promise.all(chunk.map((order) => sendOne(db, client, tenantId, merchant, order, outcome)));
        if (results.every((r) => r.result === "unreachable")) {
            primeDown = results[0]?.error ?? new Error("Prime unreachable");
            Sentry.captureException(primeDown, { extra: { tenantId, job: "prime-send", orders: toSend.length - i } });
        }
    }
    return outcome;
}

async function sendOne(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    order: SendableOrder,
    outcome: PrimeSendOutcome,
): Promise<{ result: OneResult; error?: unknown }> {
    const built = buildPrimeShipment(order, merchant);
    if (!built.ok) {
        outcome.failed.push({ orderId: order.id, reason: built.reason });
        return { result: "rejected" };
    }

    let caseId: number;
    try {
        caseId = await client.createShipment(built.payload);
    } catch (err) {
        // Prime's refusal (bad phone, amount, a field too long…) is about this order; anything else means Prime could not be reached.
        const unreachable = isPrimeUnreachable(err);
        outcome.failed.push({
            orderId: order.id,
            reason: unreachable ? "prime_unreachable" : "prime_rejected",
            message: err instanceof Error ? err.message : undefined,
        });
        return unreachable ? { result: "unreachable", error: err } : { result: "rejected" };
    }

    const { error } = await db.from("prime_shipments").insert({
        tenant_id: tenantId,
        order_id: order.id,
        receipt_no: built.payload.custReceiptNoOri,
        case_id: caseId,
        shipment_status: "ONWAY",
        // What Prime collects, until its first status read reports its own amount.
        receipt_amount_iqd: built.payload.receiptAmtIqd,
        // What Prime now holds, so a later edit that changes nothing Prime sees is not sent.
        pushed_hash: primeShipmentHash(primeUpdateFields(built.payload)),
    });
    if (!error) {
        outcome.sent.push({ orderId: order.id, caseId });
        return { result: "sent" };
    }
    // A run sent twice at once: the other call already saved this order's shipment.
    if (error.code === UNIQUE_VIOLATION && error.message.includes("prime_shipments_order_unique")) {
        outcome.sent.push({ orderId: order.id, caseId });
        return { result: "sent" };
    }
    // Another order already holds this case: two orders share a receipt number
    // and Prime handed back the first one's shipment.
    if (error.code === UNIQUE_VIOLATION) {
        outcome.failed.push({ orderId: order.id, reason: "duplicate_receipt" });
        return { result: "rejected" };
    }
    // Prime has the parcel, so it is sent (putting it in the Excel file too would
    // double it); only its status sync is missing. Loud, so it can be backfilled.
    Sentry.captureException(new Error(`Prime shipment ${caseId} for order ${order.order_id} was created but not saved: ${error.message}`));
    outcome.sent.push({ orderId: order.id, caseId });
    return { result: "sent" };
}
