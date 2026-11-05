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
 * the parcels sent before the link or by hand. What we expect Prime to
 * collect is the order's cash on delivery as our books hold it now, so an
 * accepted new price makes the parcel match.
 */
async function loadOurs(db: ServiceDb, tenantId: string, cases: readonly PrimeManifestCase[]) {
    const byCase = new Map<number, PrimeStatementOurs>();
    const byReceipt = new Map<string, PrimeStatementOurs>();
    const caseIds = [...new Set(cases.map((c) => c.caseid).filter((id): id is number => typeof id === "number"))];

    if (caseIds.length > 0) {
        const { data, error } = await db
            .from("prime_shipments")
            .select("case_id, shipment_charge, orders!inner(id, order_id, customer_name, price, delivery_fee, payment_status, status)")
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
                collect: computeCodAmount(order),
                fee: row.shipment_charge === null ? null : Number(row.shipment_charge),
                status: String(order.status),
                linked: true,
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
        const columns = "id, order_id, customer_name, price, delivery_fee, payment_status, status, is_return";
        // The receipt is the order number without its checkout prefix, and a
        // refund or replacement prints its base number (labelReceiptNumber).
        const numeric = receipts.filter((r) => /^\d+$/.test(r));
        const [plain, afterSale] = await Promise.all([
            db
                .from("orders")
                .select(columns)
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .in("order_id", receipts.flatMap((r) => [r, `CHK-${r}`])),
            numeric.length > 0
                ? db
                      .from("orders")
                      .select(columns)
                      .eq("tenant_id", tenantId)
                      .is("deleted_at", null)
                      .or(numeric.flatMap((r) => [`order_id.like.RTN-${r}-%`, `order_id.like.RPL-${r}-%`]).join(","))
                : Promise.resolve({ data: [] as OrderRow[], error: null }),
        ]);
        if (plain.error) throw new Error(plain.error.message);
        if (afterSale.error) throw new Error(afterSale.error.message);

        const collected = new Map<string, number>();
        for (const c of cases) {
            const r = c.custReceiptNoOri?.trim();
            if (r && !collected.has(r)) collected.set(r, Math.round(c.receiptAmtIqd ?? 0));
        }
        const candidates = new Map<string, PrimeStatementOurs[]>();
        for (const order of [...(plain.data ?? []), ...(afterSale.data ?? [])] as OrderRow[]) {
            const receipt = labelReceiptNumber(String(order.order_id));
            const list = candidates.get(receipt) ?? [];
            list.push({
                orderId: order.id,
                orderNumber: String(order.order_id),
                customerName: order.customer_name ?? null,
                collect: receiptCollect(order),
                fee: null,
                status: String(order.status),
                linked: false,
            });
            candidates.set(receipt, list);
        }
        for (const [receipt, list] of candidates) {
            const chosen = pickReceiptOrder(list, collected.get(receipt));
            if (chosen) byReceipt.set(receipt, chosen);
        }
    }
    return { byCase, byReceipt };
}

export interface OrderRow {
    id: string;
    order_id: string | null;
    customer_name: string | null;
    price: number | null;
    delivery_fee: number | null;
    payment_status: string | null;
    status: string;
    is_return: boolean | null;
}

/**
 * What Prime should collect on an order's parcel. A refund trip pays the
 * customer back, so it is negative: the refund (a negative price) plus the
 * pickup fee the store keeps. Every other order collects its cash on delivery.
 */
export function receiptCollect(order: OrderRow): number {
    if (!order.is_return) return computeCodAmount(order);
    return Math.round((Number(order.price) || 0) + (Number(order.delivery_fee) || 0));
}

/**
 * One receipt number can belong to an order and to its refund or replacement
 * (4030, RTN-4030-1). The one whose amount is what Prime collected wins, then
 * one still on the road, then the newest after-sale order.
 */
export function pickReceiptOrder(list: readonly PrimeStatementOurs[], primeCollect: number | undefined): PrimeStatementOurs | null {
    if (list.length === 0) return null;
    const byAmount = primeCollect === undefined ? [] : list.filter((o) => o.collect === primeCollect);
    const pool = byAmount.length > 0 ? byAmount : list;
    const open = pool.filter((o) => o.status === "in_transit" || o.status === "delivered");
    const ranked = (open.length > 0 ? open : pool).slice().sort((a, b) => b.orderNumber.localeCompare(a.orderNumber, "en", { numeric: true }));
    return ranked[0] ?? null;
}

/** A manifest's parcels laid against the tenant's orders. */
export async function matchPrimeCases(db: ServiceDb, tenantId: string, cases: readonly PrimeManifestCase[]): Promise<PrimeStatement> {
    const { byCase, byReceipt } = await loadOurs(db, tenantId, cases);
    return matchPrimeStatement(cases, byCase, byReceipt);
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
    return matchPrimeCases(db, tenantId, cases);
}
