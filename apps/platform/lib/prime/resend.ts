import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Order } from "@/types/order";
import { COURIER_SHEET_COLUMNS, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import { isPrimeUnreachable, PRIME_ERROR, PrimeApiError, type PrimeClient, type PrimeResendFix } from "@/lib/prime/client";
import { buildPrimeShipment, type PrimeMerchant, type PrimeSkipReason } from "@/lib/prime/shipment-payload";
import { PRIME_EDIT_REFUSED, withoutAttention } from "@/lib/prime/status-map";
import { primeCanBeResent } from "@/lib/prime/chip-state";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Orders still out with Prime; once the returns desk scanned the parcel in, it is back with the store. */
const OPEN_STATUSES = new Set<string>(["confirmed", "in_transit"]);
/** Version-guarded flag writes tried this many times against a person editing the same order. */
const FLAG_ATTEMPTS = 3;

export type PrimeResendResult =
    | { ok: true; alreadyResent: boolean }
    | { ok: false; reason: "not_sent" | "not_returning" | "order_closed" | PrimeSkipReason; message?: string }
    | { ok: false; reason: "prime_rejected" | "prime_unreachable"; message: string };

type ResendOrder = CourierSheetOrder & Pick<Order, "id" | "status" | "version" | "attention_reasons">;

/**
 * Ask Prime to send a returned parcel, or one whose attempt failed with the
 * driver, out again, carrying the order's
 * current phone, address, governorate, amount and note: staff usually fix one
 * of them after calling the customer. On success the order's "coming back"
 * flag (and a refused-edit flag, since the resend carries the fix) is dropped
 * and the shipment remembers the request; Prime's next status read shows
 * where the parcel went. Asking twice is harmless: Prime's "already resent"
 * counts as done.
 */
export async function resendPrimeShipment(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    orderId: string,
    note?: string,
): Promise<PrimeResendResult> {
    const { data: row, error } = await db
        .from("prime_shipments")
        .select("id, case_id, shipment_status, step_code, cancelled_at")
        .eq("tenant_id", tenantId)
        .eq("order_id", orderId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.cancelled_at) return { ok: false, reason: "not_sent" };
    if (!primeCanBeResent({ status: row.shipment_status, stepCode: row.step_code })) return { ok: false, reason: "not_returning" };

    const order = await loadOrder(db, tenantId, orderId);
    if (!order || !OPEN_STATUSES.has(order.status)) return { ok: false, reason: "order_closed" };

    const built = buildPrimeShipment(order, merchant);
    if (!built.ok) return { ok: false, reason: built.reason };
    const p = built.payload;
    const fixes: PrimeResendFix[] = [
        { column: "c_rcv_hp1", value: p.receiverHp1 },
        ...(p.receiverHp2 ? [{ column: "c_rcv_hp2" as const, value: p.receiverHp2 }] : []),
        { column: "c_rcv_state", value: p.state },
        { column: "c_rcv_addr_rmk", value: p.locationDetails },
        { column: "c_receiptamt", value: String(p.receiptAmtIqd) },
        { column: "c_rmk", value: p.rmk },
    ];

    let alreadyResent = false;
    try {
        await client.requestResend(Number(row.case_id), fixes, note);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isPrimeUnreachable(err)) return { ok: false, reason: "prime_unreachable", message };
        if (!isAlreadyResent(err)) return { ok: false, reason: "prime_rejected", message };
        alreadyResent = true;
    }

    const { error: rowError } = await db
        .from("prime_shipments")
        .update({ resent_at: new Date().toISOString(), push_error: null, receipt_amount_iqd: p.receiptAmtIqd })
        .eq("id", row.id);
    if (rowError) throw new Error(rowError.message);
    await dropReturningFlags(db, tenantId, order);
    return { ok: true, alreadyResent };
}

/**
 * Prime's "already resent" (code 7000). update-case-status answers its
 * refusals as {success:false, errorMessage} without the code (seen on
 * Prime's test system), so the guide's wording is matched as well:
 * «تمت إعادة إرسال الشحنة مسبقاً».
 */
export function isAlreadyResent(err: unknown): boolean {
    if (!(err instanceof PrimeApiError)) return false;
    if (err.code === PRIME_ERROR.alreadyResent) return true;
    return err.message.includes("إعادة إرسال") && err.message.includes("مسبق");
}

async function loadOrder(db: ServiceDb, tenantId: string, orderId: string): Promise<ResendOrder | null> {
    const { data, error } = await db
        .from("orders")
        .select(`${COURIER_SHEET_COLUMNS}, status, version, attention_reasons`)
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as unknown as ResendOrder | null;
}

/** Drop "coming back" and "edit refused", version-guarded, re-reading the order if a person changed it meanwhile. */
async function dropReturningFlags(db: ServiceDb, tenantId: string, first: ResendOrder): Promise<void> {
    let order: ResendOrder | null = first;
    for (let attempt = 0; attempt < FLAG_ATTEMPTS && order; attempt += 1) {
        const patch = withoutAttention(order.attention_reasons, ["delivery_returning", PRIME_EDIT_REFUSED]);
        if (!patch) return;
        const { data, error } = await db
            .from("orders")
            .update(patch)
            .eq("tenant_id", tenantId)
            .eq("id", order.id)
            .eq("version", order.version)
            .select("id");
        if (error) throw new Error(error.message);
        if ((data?.length ?? 0) > 0) return;
        order = await loadOrder(db, tenantId, order.id);
    }
}
