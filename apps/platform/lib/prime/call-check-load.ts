import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeClient } from "@/lib/prime/client";
import type { PrimeMerchant } from "@/lib/prime/shipment-payload";
import { previewPrimeRun, type PrimeDeskRow } from "@/lib/prime/desk-preview";
import { primeCallRecord, primePhoneKey, primePhoneVariants, type PrimeCallRecord, type PrimeCallShipmentRow } from "@/lib/prime/call-record";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** One order on the confirmation call: the customer's record with Prime, and what Prime would charge (or what to fix) if it is confirmed. */
export interface PrimeCallCheck {
    orderId: string;
    record: PrimeCallRecord;
    send: PrimeDeskRow | null;
}

/** Phones per look-up, so the request stays well inside URL limits (each phone is up to five spellings). */
const PHONES_PER_QUERY = 60;
/** A customer with more parcels than this is not one the call needs to count to the last. */
const ROWS_MAX = 2_000;

/**
 * The call check for each order, read from the caller's tenant only: the
 * orders by id, the customer's earlier Prime parcels by any spelling of the
 * phone, and the desk's fee look-up (cached per governorate and amount).
 */
export async function loadPrimeCallChecks(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    merchant: PrimeMerchant,
    orderIds: string[],
): Promise<PrimeCallCheck[]> {
    const { data: orders, error } = await db.from("orders").select("id, phone").eq("tenant_id", tenantId).in("id", orderIds).is("deleted_at", null);
    if (error) throw new Error(error.message);

    const variants = [...new Set(orders.flatMap((o) => primePhoneVariants(o.phone ?? "")))];
    const rowsByPhone = new Map<string, PrimeCallShipmentRow[]>();
    const [sends] = await Promise.all([
        previewPrimeRun(db, client, tenantId, merchant, orders.map((o) => o.id)),
        (async () => {
            for (let i = 0; i < variants.length; i += PHONES_PER_QUERY * 5) {
                const { data, error: shipError } = await db
                    .from("prime_shipments")
                    .select("order_id, shipment_status, sent_at, orders!inner(phone)")
                    .eq("tenant_id", tenantId)
                    .is("cancelled_at", null)
                    .in("orders.phone", variants.slice(i, i + PHONES_PER_QUERY * 5))
                    .limit(ROWS_MAX);
                if (shipError) throw new Error(shipError.message);
                for (const r of data) {
                    const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
                    if (!order) continue;
                    const key = primePhoneKey(String(order.phone ?? ""));
                    const list = rowsByPhone.get(key) ?? [];
                    list.push({ orderId: String(r.order_id), status: r.shipment_status === null ? null : String(r.shipment_status), sentAt: String(r.sent_at) });
                    rowsByPhone.set(key, list);
                }
            }
        })(),
    ]);

    const sendOf = new Map(sends.map((s) => [s.orderId, s]));
    return orders.map((o) => ({
        orderId: o.id,
        record: primeCallRecord(rowsByPhone.get(primePhoneKey(o.phone ?? "")) ?? [], o.id),
        send: sendOf.get(o.id) ?? null,
    }));
}
