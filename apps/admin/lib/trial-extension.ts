import type { createAdminClient } from "./admin-supabase";

/**
 * Longest single trial extension. Enforced again inside `admin_extend_trial`.
 * This module has no runtime imports so the merchant detail card can read the
 * cap without pulling server code or zod into the client bundle.
 */
export const MAX_TRIAL_EXTENSION_DAYS = 90;

export type TrialExtensionResult =
  | { ok: true; tenantId: string; trialEndsAt: string }
  | { ok: false; status: 400 | 404; error: string };

export type TrialExtensionActor = { id: string; email?: string | null };

const REFUSALS: Record<string, { status: 400 | 404; error: string }> = {
  not_found: { status: 404, error: "Merchant not found" },
  not_trial: { status: 400, error: "Tenant is not on a trial plan" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Push a trialing tenant's trial out by `days`, from max(current end, now),
 * through the `admin_extend_trial` RPC. One transaction moves
 * `tenants.trial_ends_at` (what staff and the merchant see) and the trialing
 * subscription's `current_period_end` (what billing reads) to the same
 * instant, and writes the activity row with the acting admin. Shared by
 * POST /api/trials/extend, POST /api/merchants/[id]/extend-trial and the bulk
 * action so the three cannot drift.
 *
 * Only a tenant whose status is `trial` qualifies, and the status is never
 * written. `extend_trial` is a support_staff permission; letting it move a
 * `limited` (paused) or `suspended` tenant back to `trial` would lift the pause
 * or suspension, which needs `reactivate_tenant` (super_admin).
 */
export async function extendTrial(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  days: number,
  actor: TrialExtensionActor,
  source: "single" | "bulk" = "single",
): Promise<TrialExtensionResult> {
  const { data, error } = await supabase.rpc("admin_extend_trial", {
    _tenant_id: tenantId,
    _days: days,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _source: source,
  });

  if (error) throw error;
  if (!isRecord(data)) throw new Error("Unexpected extend-trial response");

  if (data.success !== true) {
    const refusal = typeof data.error === "string" ? REFUSALS[data.error] : undefined;
    if (!refusal) throw new Error("Unexpected extend-trial response");
    return { ok: false, ...refusal };
  }

  if (typeof data.tenant_id !== "string" || typeof data.trial_ends_at !== "string") {
    throw new Error("Unexpected extend-trial response");
  }
  return { ok: true, tenantId: data.tenant_id, trialEndsAt: data.trial_ends_at };
}
