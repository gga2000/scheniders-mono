import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { COURIER_SHEET_COLUMNS, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import type { PrimeClient } from "@/lib/prime/client";
import { buildPrimeShipment, type PrimeMerchant, type PrimeSkipReason } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/**
 * One desk order as Prime would take it:
 *  - ready: Prime takes it as is; `fee` is Prime's charge for it (null when
 *    Prime has no price for the governorate or did not answer).
 *  - fix: the order holds something Prime refuses (a 10-digit phone, no
 *    governorate…); it would go in the Excel file unless fixed first.
 * `caseId` is set when Prime already has the parcel.
 */
export type PrimeDeskRow =
    | { orderId: string; kind: "ready"; fee: number | null; caseId: number | null }
    | { orderId: string; kind: "fix"; reason: PrimeSkipReason; caseId: number | null };

/** Charge look-ups at once; Prime answers each in ~0.13s. */
const CONCURRENCY = 4;
/** Prime's price list changes rarely; one look-up per merchant, state and amount serves the day's runs. */
const FEE_TTL_MS = 6 * 3_600_000;
const FEE_CACHE_MAX = 2_000;
const feeCache = new Map<string, { fee: number | null; at: number }>();

type DeskOrder = CourierSheetOrder & { id: string };

/**
 * What Prime would charge and accept for each desk order, before anything is
 * sent. Orders are read from the caller's tenant, never from the request.
 * Charges are asked once per governorate and amount (a run of 40 parcels to a
 * handful of governorates is a handful of calls) and cached for six hours; a
 * look-up Prime does not answer shows no fee rather than failing the desk.
 */
export async function previewPrimeRun(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    orderIds: string[],
): Promise<PrimeDeskRow[]> {
    const [ordersRes, sentRes] = await Promise.all([
        db.from("orders").select(COURIER_SHEET_COLUMNS).eq("tenant_id", tenantId).in("id", orderIds).is("deleted_at", null),
        db.from("prime_shipments").select("order_id, case_id, cancelled_at").eq("tenant_id", tenantId).in("order_id", orderIds),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (sentRes.error) throw new Error(sentRes.error.message);

    const caseOf = new Map(
        sentRes.data.filter((r) => r.cancelled_at == null).map((r) => [r.order_id as string, Number(r.case_id)]),
    );

    const ready: { orderId: string; key: string; state: string; amount: number; district?: number }[] = [];
    const rows = new Map<string, PrimeDeskRow>();
    for (const order of ordersRes.data as unknown as DeskOrder[]) {
        const caseId = caseOf.get(order.id) ?? null;
        const built = buildPrimeShipment(order, merchant);
        if (!built.ok) {
            rows.set(order.id, { orderId: order.id, kind: "fix", reason: built.reason, caseId });
            continue;
        }
        const { state, district, receiptAmtIqd } = built.payload;
        ready.push({ orderId: order.id, key: primeFeeKey(merchant.merchantLoginId, state, receiptAmtIqd, district), state, amount: receiptAmtIqd, district });
    }

    const fees = await lookUpFees(client, merchant.merchantLoginId, ready);
    for (const r of ready) {
        rows.set(r.orderId, { orderId: r.orderId, kind: "ready", fee: fees.get(r.key) ?? null, caseId: caseOf.get(r.orderId) ?? null });
    }
    return orderIds.flatMap((id) => rows.get(id) ?? []);
}

function primeFeeKey(merchantLoginId: string, state: string, amount: number, district?: number): string {
    return `${merchantLoginId}|${state}|${district ?? 0}|${amount}`;
}

/**
 * Prime's charge for one parcel of this amount to this state (and district),
 * from the same six-hour cache the desk uses; null when Prime has no price
 * for it. For the new-order form's live fee. Throws when Prime does not
 * answer, so the form says so instead of showing no price.
 */
export async function primeFeeQuote(
    client: PrimeClient,
    merchantLoginId: string,
    state: string,
    amount: number,
    district?: number,
): Promise<number | null> {
    const key = primeFeeKey(merchantLoginId, state, amount, district);
    const cached = feeCache.get(key);
    if (cached && Date.now() - cached.at < FEE_TTL_MS) return cached.fee;
    const fee = await client.shipmentCharge(merchantLoginId, state, amount, district);
    remember(key, fee);
    return fee;
}

async function lookUpFees(
    client: PrimeClient,
    merchantLoginId: string,
    wanted: { key: string; state: string; amount: number; district?: number }[],
): Promise<Map<string, number | null>> {
    const now = Date.now();
    const fees = new Map<string, number | null>();
    const missing = new Map<string, { state: string; amount: number; district?: number }>();
    for (const w of wanted) {
        const cached = feeCache.get(w.key);
        if (cached && now - cached.at < FEE_TTL_MS) fees.set(w.key, cached.fee);
        else missing.set(w.key, { state: w.state, amount: w.amount, district: w.district });
    }

    const queue = [...missing];
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
        await Promise.all(
            queue.slice(i, i + CONCURRENCY).map(async ([key, { state, amount, district }]) => {
                try {
                    const fee = await client.shipmentCharge(merchantLoginId, state, amount, district);
                    fees.set(key, fee);
                    remember(key, fee);
                } catch (err) {
                    // Only the fee is missing: the desk shows "—" and the run still goes. Not cached, so the next look tries again.
                    console.error("Prime charge look-up failed", { state, amount, err });
                    fees.set(key, null);
                }
            }),
        );
    }
    return fees;
}

function remember(key: string, fee: number | null): void {
    if (feeCache.size >= FEE_CACHE_MAX) {
        const oldest = feeCache.keys().next().value;
        if (oldest !== undefined) feeCache.delete(oldest);
    }
    feeCache.set(key, { fee, at: Date.now() });
}

/** Test hook: forget the cached charges. */
export function clearPrimeFeeCache(): void {
    feeCache.clear();
}
