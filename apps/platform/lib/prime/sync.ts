import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Order } from "@/types/order";
import { buildStatusUpdate } from "@/lib/orders/status-update";
import { resolveStatusForOrder } from "@/lib/order-status-machine";
import { PRIME_INFO_BATCH, type PrimeClient, type PrimeShipmentInfo } from "@/lib/prime/client";
import {
    clearPrimeAttention,
    PRIME_CANCEL_BY_HAND,
    PRIME_SETTLED_REASONS,
    primeStatusAction,
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
export const PRIME_ACTOR = "Prime";

type TrackedRow = {
    id: string;
    case_id: number;
    shipment_status: string | null;
    step_code: string | null;
    orders: Pick<Order, "id" | "status" | "version" | "is_return" | "attention_reasons">;
};

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

/**
 * Read Prime's status for a tenant's open shipments and apply it to the orders.
 * The new status is stored only after the order change landed, so a change
 * that lost a race with a person is tried again on the next run.
 */
export async function syncPrimeTenant(
    db: ServiceDb,
    client: PrimeClient,
    tenantId: string,
    stepNames: Map<string, string>,
): Promise<PrimeSyncOutcome> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data, error } = await db
        .from("prime_shipments")
        .select("id, case_id, shipment_status, step_code, orders!inner(id, status, version, is_return, attention_reasons)")
        .eq("tenant_id", tenantId)
        .eq("orders.tenant_id", tenantId)
        .in("orders.status", OPEN_STATUSES)
        .gte("sent_at", since);
    if (error) throw new Error(error.message);

    const rows = data as unknown as TrackedRow[];
    const byCase = new Map(rows.map((r) => [Number(r.case_id), r]));
    const outcome: PrimeSyncOutcome = { checked: 0, delivered: 0, flagged: 0, conflicts: 0, cleared: 0, cancelsSettled: 0 };
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i += PRIME_INFO_BATCH) {
        const caseIds = rows.slice(i, i + PRIME_INFO_BATCH).map((r) => Number(r.case_id));
        const infos = await client.shipmentsInfo(caseIds);
        outcome.checked += infos.length;

        for (const info of infos) {
            const row = byCase.get(info.caseid);
            if (!row) continue;
            const result = await applyInfo(db, tenantId, row, info, stepNames, now);
            if (result === "delivered") outcome.delivered += 1;
            else if (result === "flagged") outcome.flagged += 1;
            else if (result === "conflict") outcome.conflicts += 1;
        }

        const { error: checkedError } = await db
            .from("prime_shipments")
            .update({ checked_at: now })
            .eq("tenant_id", tenantId)
            .in("case_id", caseIds);
        if (checkedError) throw new Error(checkedError.message);
    }

    outcome.cleared = await settleClosedOrders(db, tenantId, since);
    outcome.cancelsSettled = await settleRefusedCancels(db, client, tenantId, stepNames, now);
    return outcome;
}

async function applyInfo(
    db: ServiceDb,
    tenantId: string,
    row: TrackedRow,
    info: PrimeShipmentInfo,
    stepNames: Map<string, string>,
    now: string,
): Promise<"delivered" | "flagged" | "conflict" | "unchanged" | "moved"> {
    const status = info.shipmentStatus ?? null;
    const step = info.stepCode ?? null;
    if (status === row.shipment_status && step === row.step_code) return "unchanged";

    let result: "delivered" | "flagged" | "moved" = "moved";
    if (status !== row.shipment_status) {
        const action = primeStatusAction(status);
        const order = row.orders;
        let patch: Partial<Order> | null = null;
        if (action.kind === "deliver") {
            patch = {
                ...buildStatusUpdate(resolveStatusForOrder(order, "delivered"), { changedByName: PRIME_ACTOR }),
                ...clearPrimeAttention(order.attention_reasons),
            };
            result = "delivered";
        } else if (action.kind === "flag") {
            patch = { needs_attention: true, attention_reasons: withPrimeAttention(order.attention_reasons, action.reason) };
            result = "flagged";
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
            if (!written || written.length === 0) return "conflict";
        }
    }

    const { error } = await db
        .from("prime_shipments")
        .update({
            shipment_status: status,
            step_code: step,
            step_name: step ? (stepNames.get(step) ?? step) : null,
            shipment_charge: info.shipmentCharge ?? null,
            receipt_amount_iqd: info.receiptAmtIqd ?? null,
            status_changed_at: now,
        })
        .eq("id", row.id);
    if (error) throw new Error(error.message);
    return result;
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
