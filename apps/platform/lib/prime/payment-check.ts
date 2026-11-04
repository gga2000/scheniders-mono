import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeClient } from "@/lib/prime/client";
import type { PrimeConnection } from "@/lib/prime/connection";
import { isPrepaid } from "@/lib/order-money";
import type { PrimeStatement, PrimeStatementSummary } from "@/lib/prime/statement";
import { matchPrimeCases, primeStatementEntry, PRIME_STATEMENTS_PAGE } from "@/lib/prime/statement-load";
import { withoutAttention } from "@/lib/prime/status-map";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** How a payment's parcels matched our orders when it was last checked. */
export type PrimePaymentCheck = Pick<PrimeStatementSummary, "parcels" | "matched" | "different" | "unknown" | "diff">;

/** A payment already closed in our books: approved here, or imported from Prime's PDF. */
export interface PrimeApproval {
    at: string;
    source: "app" | "pdf";
}

const UNIQUE_VIOLATION = "23505";

/** Remembers how a payment matched, so the list can show it without asking Prime again. */
export async function savePrimePaymentCheck(db: ServiceDb, tenantId: string, paymentId: number, summary: PrimeStatementSummary): Promise<void> {
    const { error } = await db.from("prime_payment_checks").upsert(
        {
            tenant_id: tenantId,
            payment_id: paymentId,
            parcels: summary.parcels,
            matched: summary.matched,
            different: summary.different,
            unknown: summary.unknown,
            diff: summary.diff,
            checked_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,payment_id" },
    );
    if (error) throw new Error(error.message);
}

export async function loadPrimePaymentChecks(db: ServiceDb, tenantId: string, paymentIds: readonly number[]): Promise<Map<number, PrimePaymentCheck>> {
    const checks = new Map<number, PrimePaymentCheck>();
    if (paymentIds.length === 0) return checks;
    const { data, error } = await db
        .from("prime_payment_checks")
        .select("payment_id, parcels, matched, different, unknown, diff")
        .eq("tenant_id", tenantId)
        .in("payment_id", [...paymentIds]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
        checks.set(Number(row.payment_id), {
            parcels: row.parcels,
            matched: row.matched,
            different: row.different,
            unknown: row.unknown,
            diff: Number(row.diff),
        });
    }
    return checks;
}

/**
 * The payments already closed in our books. A Prime payment's id is the
 * receipt number on its PDF, so a payment imported from the PDF counts too
 * and is not closed a second time here. Rolled-back imports do not count.
 */
export async function loadPrimeApprovals(db: ServiceDb, tenantId: string, paymentIds: readonly number[]): Promise<Map<number, PrimeApproval>> {
    const approvals = new Map<number, PrimeApproval>();
    if (paymentIds.length === 0) return approvals;
    const { data, error } = await db
        .from("delivery_imports")
        .select("receipt_number, confirmed_at, created_at, source:raw_data->>source")
        .eq("tenant_id", tenantId)
        .in("receipt_number", paymentIds.map(String))
        .in("status", ["confirmed", "completed"]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
        const id = Number(row.receipt_number);
        const at = row.confirmed_at ?? row.created_at;
        if (!Number.isFinite(id) || !at) continue;
        const approval: PrimeApproval = { at, source: row.source === "prime_api" ? "app" : "pdf" };
        const known = approvals.get(id);
        // The approval made here wins over an earlier PDF of the same payment.
        if (!known || approval.source === "app") approvals.set(id, approval);
    }
    return approvals;
}

/** A payment's parcels against our orders, remembered for the list. */
async function checkPayment(db: ServiceDb, client: PrimeClient, tenantId: string, connection: PrimeConnection, paymentId: number): Promise<PrimeStatement> {
    const cases = await client.paymentCases(connection.merchantLoginId, paymentId);
    const statement = await matchPrimeCases(db, tenantId, cases);
    await savePrimePaymentCheck(db, tenantId, paymentId, statement.summary);
    return statement;
}

/** One payment laid against our orders, remembered for the list, with whether it is already closed. */
export async function loadPrimePayment(db: ServiceDb, client: PrimeClient, tenantId: string, connection: PrimeConnection, paymentId: number) {
    const statement = await checkPayment(db, client, tenantId, connection, paymentId);
    const approval = (await loadPrimeApprovals(db, tenantId, [paymentId])).get(paymentId) ?? null;
    return { statement, approval };
}

async function actorName(db: ServiceDb, userId: string): Promise<string | null> {
    const { data, error } = await db.from("user_profiles").select("display_name").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { display_name: string | null } | null)?.display_name ?? null;
}

export type PrimeApproveOutcome =
    | { kind: "approved"; completed: number }
    | { kind: "already"; approval: PrimeApproval }
    | { kind: "unknown_payment" };

/**
 * Closes a Prime payment in our books: its matched parcels' orders move from
 * delivered to completed, in one database transaction that also records the
 * payment in the delivery history (where it can be rolled back). Prime's
 * fees are not booked as an expense: the store already counts its courier
 * cost on every delivered order. Parcels that differ, or are not ours, are
 * listed but left alone.
 */
export async function approvePrimePayment(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    connection: PrimeConnection,
    paymentId: number,
    userId: string,
): Promise<PrimeApproveOutcome> {
    const known = (await loadPrimeApprovals(db, tenantId, [paymentId])).get(paymentId);
    if (known) return { kind: "already", approval: known };

    const receipt = (await client.paymentReceipts(connection.merchantLoginId, 0, PRIME_STATEMENTS_PAGE)).find((r) => r.id === paymentId);
    if (!receipt) return { kind: "unknown_payment" };
    const entry = primeStatementEntry(receipt);

    const statement = await checkPayment(db, client, tenantId, connection, paymentId);
    const rows = statement.rows.map((row) => ({
        order_id: row.ours?.orderId ?? null,
        case_id: row.caseId !== null ? String(row.caseId) : row.receipt,
        collect: row.primeCollect,
        fee: row.primeFee,
        net: row.primeNet,
        kind: row.kind,
        status: row.ours?.status ?? null,
        diff: row.diff,
    }));

    const { data, error } = await db.rpc("prime_approve_payment", {
        p_tenant_id: tenantId,
        p_payment_id: paymentId,
        p_user_id: userId,
        p_changed_by: (await actorName(db, userId)) ?? "",
        p_amount: entry.amount,
        p_paid_at: entry.at,
        p_rows: rows,
    });
    if (error?.code === UNIQUE_VIOLATION) {
        const approval = (await loadPrimeApprovals(db, tenantId, [paymentId])).get(paymentId);
        if (approval) return { kind: "already", approval };
    }
    if (error) throw new Error(error.message);
    const completed = typeof data === "object" && data !== null && "completed" in data ? Number(data.completed) : 0;
    return { kind: "approved", completed };
}

export type PrimeAcceptPriceOutcome =
    | { kind: "accepted"; price: number }
    | { kind: "not_on_payment" }
    | { kind: "same" }
    | { kind: "prepaid" }
    | { kind: "conflict" };

/**
 * Takes the amount Prime collected for one parcel of a payment as the order's
 * price (Prime's collection is the order's price plus its delivery fee), so
 * the parcel matches. Read from Prime again here, never from the request.
 * A "delivered at a new price" flag on the order has then done its job.
 */
export async function acceptPrimePrice(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    connection: PrimeConnection,
    paymentId: number,
    orderId: string,
): Promise<PrimeAcceptPriceOutcome> {
    const cases = await client.paymentCases(connection.merchantLoginId, paymentId);
    const before = await matchPrimeCases(db, tenantId, cases);
    const row = before.rows.find((r) => r.ours?.orderId === orderId);
    if (!row?.ours || row.ours.collect === null) return { kind: "not_on_payment" };
    if (row.primeCollect === row.ours.collect) return { kind: "same" };

    const { data: order, error } = await db
        .from("orders")
        .select("id, price, delivery_fee, payment_status, version, attention_reasons, delivery_note")
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { kind: "not_on_payment" };
    if (isPrepaid(order.payment_status)) return { kind: "prepaid" };

    const price = row.primeCollect - Math.round(Number(order.delivery_fee) || 0);
    if (price < 0) return { kind: "not_on_payment" };
    const note = `Prime payment #${paymentId}: price ${Math.round(Number(order.price) || 0)} → ${price}`;
    const { data: written, error: writeError } = await db
        .from("orders")
        .update({
            price,
            delivery_note: order.delivery_note ? `${order.delivery_note} | ${note}` : note,
            ...withoutAttention(order.attention_reasons, ["delivery_price_changed"]),
        })
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .eq("version", order.version)
        .select("id");
    if (writeError) throw new Error(writeError.message);
    if (!written || written.length === 0) return { kind: "conflict" };

    await savePrimePaymentCheck(db, tenantId, paymentId, (await matchPrimeCases(db, tenantId, cases)).summary);
    return { kind: "accepted", price };
}
