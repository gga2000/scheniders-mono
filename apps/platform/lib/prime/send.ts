import * as Sentry from "@sentry/nextjs";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { COURIER_SHEET_COLUMNS, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import { PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import { buildPrimeShipment, type PrimeMerchant, type PrimeSkipReason } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Why an order did not reach Prime through the API. Each one goes in the Excel file instead. */
export type PrimeSendFailure = PrimeSkipReason | "not_found" | "not_confirmed" | "duplicate_receipt" | "prime_rejected" | "prime_unreachable";

export interface PrimeSendOutcome {
    sent: { orderId: string; caseId: number }[];
    failed: { orderId: string; reason: PrimeSendFailure; message?: string }[];
}

/** Shipments created at once; Prime answers each in ~0.3s. */
const CONCURRENCY = 4;
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

type SendableOrder = CourierSheetOrder & { id: string; status: string };

/**
 * Hand a dispatch run's orders to Prime, one shipment each. Orders already
 * sent are reported as sent again (a retried run never doubles a shipment);
 * Prime itself returns the same case for the same receipt within 12 hours.
 * Never throws for one order: every order ends up in `sent` or `failed`.
 */
export async function sendOrdersToPrime(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    orderIds: string[],
): Promise<PrimeSendOutcome> {
    const outcome: PrimeSendOutcome = { sent: [], failed: [] };

    const [ordersRes, existingRes] = await Promise.all([
        db.from("orders").select(`${COURIER_SHEET_COLUMNS}, status`).eq("tenant_id", tenantId).in("id", orderIds),
        db.from("prime_shipments").select("order_id, case_id").eq("tenant_id", tenantId).in("order_id", orderIds),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (existingRes.error) throw new Error(existingRes.error.message);

    const orders = new Map((ordersRes.data as unknown as SendableOrder[]).map((o) => [o.id, o]));
    const alreadySent = new Map(existingRes.data.map((r) => [r.order_id as string, Number(r.case_id)]));

    const toSend: SendableOrder[] = [];
    for (const id of orderIds) {
        const order = orders.get(id);
        const caseId = alreadySent.get(id);
        if (caseId) outcome.sent.push({ orderId: id, caseId });
        else if (!order) outcome.failed.push({ orderId: id, reason: "not_found" });
        // The desk ships confirmed orders and moves them to in transit afterwards.
        else if (order.status !== "confirmed") outcome.failed.push({ orderId: id, reason: "not_confirmed" });
        else toSend.push(order);
    }

    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
        const chunk = toSend.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((order) => sendOne(db, client, tenantId, merchant, order, outcome)));
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
): Promise<void> {
    const built = buildPrimeShipment(order, merchant);
    if (!built.ok) {
        outcome.failed.push({ orderId: order.id, reason: built.reason });
        return;
    }

    let caseId: number;
    try {
        caseId = await client.createShipment(built.payload);
    } catch (err) {
        // A Prime answer (bad phone, oversize…) is about this order; anything else means Prime could not be reached.
        const rejected = err instanceof PrimeApiError && err.status >= 400 && err.status < 500;
        outcome.failed.push({
            orderId: order.id,
            reason: rejected ? "prime_rejected" : "prime_unreachable",
            message: err instanceof Error ? err.message : undefined,
        });
        return;
    }

    const { error } = await db.from("prime_shipments").insert({
        tenant_id: tenantId,
        order_id: order.id,
        receipt_no: built.payload.custReceiptNoOri,
        case_id: caseId,
        shipment_status: "ONWAY",
    });
    if (!error) {
        outcome.sent.push({ orderId: order.id, caseId });
        return;
    }
    // A run sent twice at once: the other call already saved this order's shipment.
    if (error.code === UNIQUE_VIOLATION && error.message.includes("prime_shipments_order_unique")) {
        outcome.sent.push({ orderId: order.id, caseId });
        return;
    }
    // Another order already holds this case: two orders share a receipt number
    // (a split order's -B part) and Prime handed back the first one's shipment.
    if (error.code === UNIQUE_VIOLATION) {
        outcome.failed.push({ orderId: order.id, reason: "duplicate_receipt" });
        return;
    }
    // Prime has the parcel, so it is sent (putting it in the Excel file too would
    // double it); only its status sync is missing. Loud, so it can be backfilled.
    Sentry.captureException(new Error(`Prime shipment ${caseId} for order ${order.order_id} was created but not saved: ${error.message}`));
    outcome.sent.push({ orderId: order.id, caseId });
}
