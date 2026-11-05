import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Order } from "@/types/order";
import { buildStatusUpdate } from "@/lib/orders/status-update";
import { resolveStatusForOrder } from "@/lib/order-status-machine";
import { PRIME_INFO_BATCH, type PrimeClient, type PrimeShipmentInfo } from "@/lib/prime/client";
import { noticeDelivered, noticeParcelFlag, type PrimeNoticeOrder } from "@/lib/prime/notify";
import {
    clearPrimeAttention,
    PRIME_CANCEL_BY_HAND,
    PRIME_SETTLED_REASONS,
    primeStatusAction,
    type PrimeAttentionReason,
    withAttention,
    withoutAttention,
    withPrimeAttention,
} from "@/lib/prime/status-map";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Orders still out with the courier: the only ones Prime can still change. */
const OPEN_STATUSES: Order["status"][] = ["confirmed", "in_transit"];
/** Shipments older than this are left alone (lost causes are a person's job). */
const LOOKBACK_DAYS = 60;
/** Shown as who changed the order's status. */
import { PRIME_ACTOR } from "./actor";
export { PRIME_ACTOR };

type TrackedRow = {
    id: string;
    case_id: number;
    shipment_status: string | null;
    step_code: string | null;
    orders: Pick<Order, "id" | "order_id" | "customer_name" | "city" | "status" | "version" | "is_return" | "attention_reasons">;
};

/** The order a Prime notice is about, as the notice reads it. */
type NoticeSource = { orders: Pick<Order, "id" | "order_id" | "customer_name" | "city"> };

/** What one parcel's read did: the order it moved (delivered, or flagged for a person and why). */
type Applied =
    | { kind: "delivered" }
    | { kind: "flagged"; reason: PrimeAttentionReason }
    | { kind: "conflict" | "unchanged" | "moved" };

type SettledRow = {
    id: string;
    orders: Pick<Order, "id" | "status" | "version" | "attention_reasons">;
};

type RefusedCancelRow = SettledRow & { case_id: number; shipment_status: string | null };

export interface PrimeSyncOutcome {
    checked: number;
    delivered: number;
    flagged: number;
    /** Orders a person changed meanwhile; retried on the next run. */
    conflicts: number;
    /** Prime flags dropped from orders a person has since closed (a returned parcel the returns desk scanned in, say). */
    cleared: number;
    /** "Cancel with Prime by hand" flags dropped: Prime closed the case, or the order was reopened. */
    cancelsSettled: number;
}

/** The columns a status read needs of a tracked shipment and its order. */
const TRACKED_SELECT =
    "id, case_id, shipment_status, step_code, orders!inner(id, order_id, customer_name, city, status, version, is_return, attention_reasons)";

/** What a status read did to the parcels it read. */
type ReadCounts = Pick<PrimeSyncOutcome, "checked" | "delivered" | "flagged" | "conflicts">;

/**
 * Read Prime's status for a tenant's open shipments and apply it to the orders.
 * The new status is stored only after the order change landed, so a change
 * that lost a race with a person is tried again on the next run. Deliveries
 * are announced by announcePrimeDeliveries, not here.
 */
export async function syncPrimeTenant(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    stepNames: Map<string, string>,
): Promise<PrimeSyncOutcome> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const rows = await trackedRows(db, tenantId, since);
    const now = new Date().toISOString();
    const read = await readAndApply(db, client, tenantId, rows, stepNames, now);
    const cleared = await settleClosedOrders(db, tenantId, since);
    const cancelsSettled = await settleRefusedCancels(db, client, tenantId, stepNames, now);
    return { ...read, cleared, cancelsSettled };
}

/**
 * The same read for the cases Prime just told us about (its webhook), with
 * the same rules: only this tenant's open orders sent in the last 60 days.
 */
export async function syncPrimeCases(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    caseIds: readonly number[],
    stepNames: Map<string, string>,
): Promise<ReadCounts> {
    if (caseIds.length === 0) return { checked: 0, delivered: 0, flagged: 0, conflicts: 0 };
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const rows = await trackedRows(db, tenantId, since, caseIds);
    return readAndApply(db, client, tenantId, rows, stepNames, new Date().toISOString());
}

/**
 * One "delivered" line for every parcel delivered since the last one went
 * out: through the 15-minute read or one by one through Prime's webhook.
 * Run every 5 minutes, so a busy afternoon reads "12 orders delivered", not
 * twelve pushes. The rows are cleared after the line is written; a failed
 * write keeps them for the next run.
 */
export async function announcePrimeDeliveries(db: ServiceDb, tenantId: string, batchKey: string): Promise<number> {
    const { data, error } = await db
        .from("prime_shipments")
        .select("id, orders!inner(id, order_id, customer_name, city)")
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .eq("delivery_unannounced", true);
    if (error) throw new Error(error.message);
    const rows = data as unknown as ({ id: string } & NoticeSource)[];
    if (rows.length === 0) return 0;

    await noticeDelivered(db, tenantId, rows.map((r) => noticeOrder(r)), batchKey);
    const { error: clearError } = await db
        .from("prime_shipments")
        .update({ delivery_unannounced: false })
        .eq("tenant_id", tenantId)
        .in("id", rows.map((r) => r.id));
    if (clearError) throw new Error(clearError.message);
    return rows.length;
}

/** A tenant's shipments whose orders are still out with Prime, optionally only some cases. */
async function trackedRows(db: ServiceDb, tenantId: string, since: string, caseIds?: readonly number[]): Promise<TrackedRow[]> {
    let query = db
        .from("prime_shipments")
        .select(TRACKED_SELECT)
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .in("orders.status", OPEN_STATUSES)
        .gte("sent_at", since);
    if (caseIds) query = query.in("case_id", [...caseIds]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data as unknown as TrackedRow[];
}

/** Reads Prime's status for the rows, applies it, and tells the store about each parcel Prime flagged. */
async function readAndApply(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    rows: TrackedRow[],
    stepNames: Map<string, string>,
    now: string,
): Promise<ReadCounts> {
    const byCase = new Map(rows.map((r) => [Number(r.case_id), r]));
    const counts: ReadCounts = { checked: 0, delivered: 0, flagged: 0, conflicts: 0 };

    for (let i = 0; i < rows.length; i += PRIME_INFO_BATCH) {
        const caseIds = rows.slice(i, i + PRIME_INFO_BATCH).map((r) => Number(r.case_id));
        const infos = await client.shipmentsInfo(caseIds);
        counts.checked += infos.length;

        for (const info of infos) {
            const row = byCase.get(info.caseid);
            if (!row) continue;
            const applied = await applyInfo(db, tenantId, row, info, stepNames, now);
            if (applied.kind === "delivered") counts.delivered += 1;
            else if (applied.kind === "flagged") {
                counts.flagged += 1;
                await noticeParcelFlag(db, tenantId, noticeOrder(row), applied.reason);
            } else if (applied.kind === "conflict") counts.conflicts += 1;
        }

        const { error: checkedError } = await db
            .from("prime_shipments")
            .update({ checked_at: now })
            .eq("tenant_id", tenantId)
            .in("case_id", caseIds);
        if (checkedError) throw new Error(checkedError.message);
    }
    return counts;
}

async function applyInfo(
    db: ServiceDb,
    tenantId: string,
    row: TrackedRow,
    info: PrimeShipmentInfo,
    stepNames: Map<string, string>,
    now: string,
): Promise<Applied> {
    const status = info.shipmentStatus ?? null;
    const step = info.stepCode ?? null;
    if (status === row.shipment_status && step === row.step_code) return { kind: "unchanged" };

    let result: Applied = { kind: "moved" };
    if (status !== row.shipment_status) {
        const action = primeStatusAction(status);
        const order = row.orders;
        let patch: Partial<Order> | null = null;
        if (action.kind === "deliver") {
            patch = {
                ...buildStatusUpdate(resolveStatusForOrder(order, "delivered"), { changedByName: PRIME_ACTOR }),
                ...clearPrimeAttention(order.attention_reasons),
            };
            result = { kind: "delivered" };
        } else if (action.kind === "flag") {
            patch = { needs_attention: true, attention_reasons: withPrimeAttention(order.attention_reasons, action.reason) };
            result = { kind: "flagged", reason: action.reason };
        }
        if (patch) {
            const { data: written, error } = await db
                .from("orders")
                .update(patch)
                .eq("tenant_id", tenantId)
                .eq("id", order.id)
                .eq("version", order.version)
                .in("status", OPEN_STATUSES)
                .select("id");
            if (error) throw new Error(error.message);
            if (!written || written.length === 0) return { kind: "conflict" };
        }
    }

    const { error } = await db
        .from("prime_shipments")
        .update({
            shipment_status: status,
            step_code: step,
            step_name: step ? (stepNames.get(step) ?? step) : null,
            shipment_charge: info.shipmentCharge ?? null,
            // What we sent stays until Prime reports its own amount.
            ...(typeof info.receiptAmtIqd === "number" ? { receipt_amount_iqd: info.receiptAmtIqd } : {}),
            status_changed_at: now,
            // Announced with the next "delivered" line (announcePrimeDeliveries).
            ...(result.kind === "delivered" ? { delivery_unannounced: true } : {}),
        })
        .eq("id", row.id);
    if (error) throw new Error(error.message);
    return result;
}

function noticeOrder(row: NoticeSource): PrimeNoticeOrder {
    return { id: row.orders.id, orderNumber: String(row.orders.order_id), customerName: row.orders.customer_name ?? null, city: row.orders.city ?? null };
}

/**
 * A Prime flag has done its job once a person closed the order: the returns
 * desk scanned the returned parcel in (rejected), or staff cancelled or
 * completed the order. Those flags are dropped here so the order does not
 * stay marked as needing attention forever. "Cancel with Prime by hand" is
 * not one of them: it is raised on a cancelled order (settleRefusedCancels).
 * Version-guarded like every other write; a lost race is retried next run.
 */
async function settleClosedOrders(db: ServiceDb, tenantId: string, since: string): Promise<number> {
    const { data, error } = await db
        .from("prime_shipments")
        .select("id, orders!inner(id, status, version, attention_reasons)")
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .not("orders.status", "in", `(${OPEN_STATUSES.join(",")})`)
        .overlaps("orders.attention_reasons", [...PRIME_SETTLED_REASONS])
        .gte("sent_at", since);
    if (error) throw new Error(error.message);

    let cleared = 0;
    for (const row of data as unknown as SettledRow[]) {
        const patch = clearPrimeAttention(row.orders.attention_reasons);
        if (!patch) continue;
        const { data: written, error: writeError } = await db
            .from("orders")
            .update(patch)
            .eq("tenant_id", tenantId)
            .eq("id", row.orders.id)
            .eq("version", row.orders.version)
            .select("id");
        if (writeError) throw new Error(writeError.message);
        if (written && written.length > 0) cleared += 1;
    }
    return cleared;
}

/**
 * Orders cancelled after Prime already had the parcel carry "cancel with
 * Prime by hand" until the case closes. Their shipments are read here (the
 * main sync reads open orders only): once Prime cancels, returns or delivers
 * the parcel, the flag goes. A delivery of a cancelled order is flagged as a
 * wrong status for a person, never applied. A reopened order drops the flag.
 */
async function settleRefusedCancels(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    stepNames: Map<string, string>,
    now: string,
): Promise<number> {
    const { data, error } = await db
        .from("prime_shipments")
        .select("id, case_id, shipment_status, orders!inner(id, status, version, attention_reasons)")
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .not("cancel_refused_at", "is", null)
        .is("cancelled_at", null)
        .contains("orders.attention_reasons", [PRIME_CANCEL_BY_HAND]);
    if (error) throw new Error(error.message);

    const rows = data as unknown as RefusedCancelRow[];
    let settled = 0;
    const stillCancelled = rows.filter((r) => r.orders.status === "cancelled");
    for (const row of rows) {
        if (row.orders.status === "cancelled") continue;
        if (await writeOrder(db, tenantId, row.orders, withoutAttention(row.orders.attention_reasons, [PRIME_CANCEL_BY_HAND]))) settled += 1;
    }

    const byCase = new Map(stillCancelled.map((r) => [Number(r.case_id), r]));
    for (let i = 0; i < stillCancelled.length; i += PRIME_INFO_BATCH) {
        const infos = await client.shipmentsInfo(stillCancelled.slice(i, i + PRIME_INFO_BATCH).map((r) => Number(r.case_id)));
        for (const info of infos) {
            const row = byCase.get(info.caseid);
            if (!row) continue;
            const action = primeStatusAction(info.shipmentStatus);
            if (action.kind === "none") continue;
            // The select only reads orders that carry the flag, so there is always one to drop.
            const without = withoutAttention(row.orders.attention_reasons, [PRIME_CANCEL_BY_HAND]);
            if (!without) continue;
            const patch = action.kind === "deliver" ? (withAttention(without.attention_reasons, "delivery_wrong_status") ?? without) : without;
            if (!(await writeOrder(db, tenantId, row.orders, patch))) continue;
            settled += 1;
            const step = info.stepCode ?? null;
            const { error: rowError } = await db
                .from("prime_shipments")
                .update({
                    shipment_status: info.shipmentStatus,
                    step_code: step,
                    step_name: step ? (stepNames.get(step) ?? step) : null,
                    status_changed_at: now,
                    checked_at: now,
                })
                .eq("id", row.id);
            if (rowError) throw new Error(rowError.message);
        }
    }
    return settled;
}

/** A version-guarded attention write; true when it landed. */
async function writeOrder(
    db: ServiceDb,
    tenantId: string,
    order: Pick<Order, "id" | "version">,
    patch: { needs_attention: boolean; attention_reasons: string[] } | null,
): Promise<boolean> {
    if (!patch) return false;
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
