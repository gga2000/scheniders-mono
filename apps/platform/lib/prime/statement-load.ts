import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeClient, PrimeManifestCase, PrimePaymentReceipt } from "@/lib/prime/client";
import type { PrimeConnection } from "@/lib/prime/connection";
import { labelReceiptNumber } from "@/lib/dispatch-label";
import { computeCodAmount } from "@/lib/order-money";
import { matchPrimeStatement, type PrimeStatement, type PrimeStatementOurs } from "@/lib/prime/statement";
import { primeHistoryTime } from "@/lib/prime/track";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** A payment Prime made to the merchant, as the Prime page lists it. */
export interface PrimeStatementEntry {
    id: number;
    amount: number;
    /** ISO instant, or null when Prime sent no readable time. */
    at: string | null;
    confirmed: boolean;
    remarks: string | null;
}

/** How many payments the statements tab lists. */
export const PRIME_STATEMENTS_PAGE = 20;

export function primeStatementEntry(r: PrimePaymentReceipt): PrimeStatementEntry {
    return {
        id: r.id,
        amount: Math.round(r.transactionAmountIqd ?? 0),
        at: r.createdDateTime ? primeHistoryTime(r.createdDateTime) : null,
        confirmed: r.confirmedReception === true,
        remarks: r.remarks?.trim() || null,
    };
}

/**
 * Our side of a manifest's parcels, in the caller's tenant only: by case id
 * through the shipments we created, then by receipt (our order number) for
 * the parcels sent before the link or by hand.
 */
async function loadOurs(db: ServiceDb, tenantId: string, cases: readonly PrimeManifestCase[]) {
    const byCase = new Map<number, PrimeStatementOurs>();
    const byReceipt = new Map<string, PrimeStatementOurs>();
    const caseIds = [...new Set(cases.map((c) => c.caseid).filter((id): id is number => typeof id === "number"))];

    if (caseIds.length > 0) {
        const { data, error } = await db
            .from("prime_shipments")
            .select("case_id, receipt_amount_iqd, shipment_charge, orders!inner(id, order_id, customer_name)")
            .eq("tenant_id", tenantId)
            .in("case_id", caseIds);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
            const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
            if (!order) continue;
            byCase.set(Number(row.case_id), {
                orderId: order.id,
                orderNumber: String(order.order_id ?? ""),
                customerName: order.customer_name ?? null,
                collect: row.receipt_amount_iqd === null ? null : Number(row.receipt_amount_iqd),
                fee: row.shipment_charge === null ? null : Number(row.shipment_charge),
            });
        }
    }

    const receipts = [
        ...new Set(
            cases
                .filter((c) => !(typeof c.caseid === "number" && byCase.has(c.caseid)))
                .map((c) => c.custReceiptNoOri?.trim())
                .filter((r): r is string => !!r),
        ),
    ];
    if (receipts.length > 0) {
        const { data, error } = await db
            .from("orders")
            .select("id, order_id, customer_name, price, delivery_fee, payment_status")
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            // The receipt is the order number without its checkout prefix (labelReceiptNumber).
            .in("order_id", receipts.flatMap((r) => [r, `CHK-${r}`]));
        if (error) throw new Error(error.message);
        for (const order of data ?? []) {
            byReceipt.set(labelReceiptNumber(String(order.order_id)), {
                orderId: order.id,
                orderNumber: String(order.order_id),
                customerName: order.customer_name ?? null,
                collect: computeCodAmount(order),
                fee: null,
            });
        }
    }
    return { byCase, byReceipt };
}

/** One payment manifest laid against our orders. */
export async function loadPrimeStatement(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    connection: PrimeConnection,
    paymentId: number,
): Promise<PrimeStatement> {
    const cases = await client.paymentCases(connection.merchantLoginId, paymentId);
    const { byCase, byReceipt } = await loadOurs(db, tenantId, cases);
    return matchPrimeStatement(cases, byCase, byReceipt);
}
