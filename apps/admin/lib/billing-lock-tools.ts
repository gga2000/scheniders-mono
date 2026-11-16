import type { createAdminClient } from "./admin-supabase";

/**
 * Staff tools for the billing lock (Fermi handoff A1, item 7): give a locked
 * store more storefront orders, or unlock it for free. Each needs a reason,
 * and the SQL function writes the activity row with it
 * (20261116021735_billing_lock_staff_tools.sql). Extending a trial is
 * lib/trial-extension.ts and takes the same reason.
 *
 * No runtime imports, so the merchant card can read the limits without pulling
 * server code into the client bundle. The limits are enforced again in SQL.
 */
export const STAFF_REASON_MIN = 3;
export const STAFF_REASON_MAX = 500;
export const MAX_LOCK_ORDERS_GRANT = 1000;
export const MAX_FREE_UNLOCK_DAYS = 90;

/** A reason the database accepts: trimmed, 3 to 500 characters. */
export function isStaffReason(reason: string): boolean {
  const length = reason.trim().length;
  return length >= STAFF_REASON_MIN && length <= STAFF_REASON_MAX;
}

export type StaffActor = { id: string; email?: string | null };

/** The lock as billing_lock_snapshot returns it. */
export type BillingLockSnapshot = {
  locked: boolean;
  reason: "trial_ended" | "unpaid" | null;
  since: string | null;
  orders_left: number | null;
  allowance: number;
  plan: string | null;
  price_iqd: number;
};

type Refusal = { ok: false; status: 404 | 409; error: string };

const REFUSALS: Record<string, Omit<Refusal, "ok">> = {
  not_found: { status: 404, error: "Merchant not found" },
  not_locked: { status: 409, error: "This store is not locked" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function refusalOf(data: Record<string, unknown>, rpc: string): Refusal {
  const refusal = typeof data.error === "string" ? REFUSALS[data.error] : undefined;
  if (!refusal) throw new Error(`Unexpected ${rpc} response`);
  return { ok: false, ...refusal };
}

/** Read a store's lock with the service role. Null for an unknown store. */
export async function readBillingLock(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<BillingLockSnapshot | null> {
  const { data, error } = await supabase.rpc("billing_lock_snapshot", { _tenant_id: tenantId });
  if (error) throw error;
  if (data === null) return null;
  if (
    !isRecord(data) ||
    typeof data.locked !== "boolean" ||
    (data.reason !== null && data.reason !== "trial_ended" && data.reason !== "unpaid") ||
    (data.since !== null && typeof data.since !== "string") ||
    (data.orders_left !== null && typeof data.orders_left !== "number") ||
    typeof data.allowance !== "number" ||
    (data.plan !== null && typeof data.plan !== "string")
  ) {
    throw new Error("Unexpected billing_lock_snapshot response");
  }
  return {
    locked: data.locked,
    reason: data.reason,
    since: data.since,
    orders_left: data.orders_left,
    allowance: data.allowance,
    plan: data.plan,
    price_iqd: Number(data.price_iqd ?? 0),
  };
}

/** Give a locked store `orders` more storefront orders before it pauses. */
export async function addLockOrders(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  orders: number,
  reason: string,
  actor: StaffActor,
): Promise<{ ok: true; ordersLeft: number } | Refusal> {
  const { data, error } = await supabase.rpc("admin_add_lock_orders", {
    _tenant_id: tenantId,
    _orders: orders,
    _reason: reason,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
  });
  if (error) throw error;
  if (!isRecord(data)) throw new Error("Unexpected admin_add_lock_orders response");
  if (data.success !== true) return refusalOf(data, "admin_add_lock_orders");
  if (typeof data.orders_left !== "number") throw new Error("Unexpected admin_add_lock_orders response");
  return { ok: true, ordersLeft: data.orders_left };
}

/**
 * Unlock a locked store for free: a paid period of `days` with no wallet
 * charge. When it ends, renewal charges the wallet as usual.
 */
export async function forceUnlock(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  days: number,
  reason: string,
  actor: StaffActor,
): Promise<{ ok: true; periodEnd: string; lockReason: string } | Refusal> {
  const { data, error } = await supabase.rpc("admin_force_unlock", {
    _tenant_id: tenantId,
    _days: days,
    _reason: reason,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
  });
  if (error) throw error;
  if (!isRecord(data)) throw new Error("Unexpected admin_force_unlock response");
  if (data.success !== true) return refusalOf(data, "admin_force_unlock");
  if (typeof data.period_end !== "string" || typeof data.lock_reason !== "string") {
    throw new Error("Unexpected admin_force_unlock response");
  }
  return { ok: true, periodEnd: data.period_end, lockReason: data.lock_reason };
}
