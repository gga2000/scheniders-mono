import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Server-side half of the billing lock (Fermi handoff A1): a store whose trial
 * ended or whose month is unpaid keeps its orders, shipping, labels, export,
 * returns and paying; every other page shows the lock screen, and the APIs
 * behind those pages refuse here too, so the lock is not only a screen.
 *
 * The lock is read with billing_lock_snapshot, the same read the dashboard
 * and the staff console use.
 */
export const BILLING_LOCKED_CODE = "billing_locked";

export const BILLING_LOCKED_MESSAGE =
    "This store is locked until its bill is paid. Orders, shipping and paying still work.";

export type ServerBillingLock = { locked: false } | { locked: true; reason: "trial_ended" | "unpaid" };

/** The store's lock, read with the service role. An unknown store is not locked. */
export async function readServerBillingLock(tenantId: string): Promise<ServerBillingLock> {
    const { data, error } = await createSupabaseServiceClient().rpc("billing_lock_snapshot", {
        _tenant_id: tenantId,
    });
    if (error) throw new Error(`billing lock check failed: ${error.message}`);
    const lock = data as { locked?: unknown; reason?: unknown } | null;
    if (lock?.locked !== true) return { locked: false };
    return { locked: true, reason: lock.reason === "unpaid" ? "unpaid" : "trial_ended" };
}

/** Null when the store may use the route; the 402 answer when it is locked. */
export async function billingLockRefusal(tenantId: string): Promise<NextResponse | null> {
    const lock = await readServerBillingLock(tenantId);
    if (!lock.locked) return null;
    return NextResponse.json(
        { success: false, error: BILLING_LOCKED_MESSAGE, code: BILLING_LOCKED_CODE, reason: lock.reason },
        { status: 402 },
    );
}
