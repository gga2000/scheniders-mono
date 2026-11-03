import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Order } from "@/types/order";
import { buildStatusUpdate } from "@/lib/orders/status-update";
import { resolveStatusForOrder } from "@/lib/order-status-machine";
import { PRIME_INFO_BATCH, type PrimeClient, type PrimeShipmentInfo } from "@/lib/prime/client";
import { clearPrimeAttention, primeStatusAction, withPrimeAttention } from "@/lib/prime/status-map";

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

export interface PrimeSyncOutcome {
    checked: number;
    delivered: number;
    flagged: number;
    /** Orders a person changed meanwhile; retried on the next run. */
    conflicts: number;
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
    const outcome: PrimeSyncOutcome = { checked: 0, delivered: 0, flagged: 0, conflicts: 0 };
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
            status_changed_at: now,
        })
        .eq("id", row.id);
    if (error) throw new Error(error.message);
    return result;
}
