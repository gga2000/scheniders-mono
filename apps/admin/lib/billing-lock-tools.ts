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

/**
 * The database saw this request id used for a different change on the same
 * shop (staff_action_seen). Shared by every *_once caller.
 */
export const REQUEST_REUSED = {
  status: 409,
  error: "This request was already used for another change. Reload the page and try again",
} as const;

/**
 * The shop is paused, so the database refuses the change until the pause is
 * lifted. One sentence for every route that meets it (round 19: it was
 * written five ways, with "store" and "shop" for the same thing).
 */
export const SHOP_PAUSED = { status: 409, error: "This shop is paused. Lift the pause first" } as const;

/** What a staff member is told when a reason is too short: one sentence, said only from here. */
export const STAFF_REASON_TOO_SHORT = `Write a reason with at least ${STAFF_REASON_MIN} letters.`;

/**
 * The letters in a reason, in any script. "..." has none, so it is no
 * reason; "متجر" has four. The database counts the same letters
 * (admin_billing_reason). Round 18: any character counted, so "..." passed.
 */
export function staffReasonLetters(reason: string): number {
  return reason.match(/\p{L}/gu)?.length ?? 0;
}

/** A reason the database accepts: at least 3 letters, at most 500 characters once trimmed. */
export function isStaffReason(reason: string): boolean {
  const trimmed = reason.trim();
  return staffReasonLetters(trimmed) >= STAFF_REASON_MIN && trimmed.length <= STAFF_REASON_MAX;
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
  /**
   * The shop's renewal is off (never the demo store's): no job charges the
   * month, so money alone does not open the lock (20261119074502).
   */
  renewal_off: boolean;
};

type Refusal = { ok: false; status: 403 | 404 | 409; error: string };

const REFUSALS: Record<string, Omit<Refusal, "ok">> = {
  not_found: { status: 404, error: "Merchant not found" },
  request_reused: REQUEST_REUSED,
  not_locked: { status: 409, error: "This store is not locked" },
  paused: SHOP_PAUSED,
  unpaid_lock: { status: 403, error: "A store locked for an unpaid month gets more orders from a super admin" },
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
    (data.plan !== null && typeof data.plan !== "string") ||
    typeof data.renewal_off !== "boolean"
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
    renewal_off: data.renewal_off,
  };
}

/**
 * Give a locked store `orders` more storefront orders before it pauses, once
 * per `requestId` (admin_add_lock_orders_once): a retry gets the first answer
 * back with `repeat`, and no orders are added twice.
 */
export async function addLockOrders(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  orders: number,
  reason: string,
  actor: StaffActor,
  /** Room at the end of a trial is support's to give; an unpaid month needs a super admin. */
  mayGrantUnpaid: boolean,
  requestId: string,
): Promise<{ ok: true; ordersLeft: number; repeat: boolean } | Refusal> {
  const { data, error } = await supabase.rpc("admin_add_lock_orders_once", {
    _request_id: requestId,
    _tenant_id: tenantId,
    _orders: orders,
    _reason: reason,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _may_grant_unpaid: mayGrantUnpaid,
  });
  if (error) throw error;
  if (!isRecord(data)) throw new Error("Unexpected admin_add_lock_orders response");
  if (data.success !== true) return refusalOf(data, "admin_add_lock_orders");
  if (typeof data.orders_left !== "number") throw new Error("Unexpected admin_add_lock_orders response");
  return { ok: true, ordersLeft: data.orders_left, repeat: data.repeat === true };
}

/**
 * Unlock a locked store for free: a paid period of `days` with no wallet
 * charge. When it ends, renewal charges the wallet as usual. Once per
 * `requestId` (admin_force_unlock_once), like addLockOrders.
 */
export async function forceUnlock(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  days: number,
  reason: string,
  actor: StaffActor,
  requestId: string,
): Promise<{ ok: true; periodEnd: string; lockReason: string; repeat: boolean } | Refusal> {
  const { data, error } = await supabase.rpc("admin_force_unlock_once", {
    _request_id: requestId,
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
  return { ok: true, periodEnd: data.period_end, lockReason: data.lock_reason, repeat: data.repeat === true };
}
