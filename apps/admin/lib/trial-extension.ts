import type { createAdminClient } from "./admin-supabase";

/**
 * Longest single trial extension. Matches the bulk "extend_trial" action.
 * This module has no runtime imports so the merchant detail card can read the
 * cap without pulling server code or zod into the client bundle.
 */
export const MAX_TRIAL_EXTENSION_DAYS = 90;

export type TrialExtensionResult =
  | { ok: true; tenantId: string; trialEndsAt: string }
  | { ok: false; status: 400 | 404; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Push a trialing tenant's `trial_ends_at` out by `days`, from
 * max(current end, now). Shared by POST /api/trials/extend and
 * POST /api/merchants/[id]/extend-trial so the two cannot drift.
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
): Promise<TrialExtensionResult> {
  const { data: tenant, error: fetchError } = await supabase
    .from("tenants")
    .select("trial_ends_at, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!tenant) return { ok: false, status: 404, error: "Merchant not found" };
  if (tenant.status !== "trial") {
    return { ok: false, status: 400, error: "Tenant is not on a trial plan" };
  }

  const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : Number.NaN;
  const base = Number.isFinite(currentEnd) ? Math.max(currentEnd, Date.now()) : Date.now();
  const trialEndsAt = new Date(base + days * DAY_MS).toISOString();

  // Re-check the status in the write itself: a pause that lands between the
  // read and this update leaves the row untouched instead of being extended.
  const { data: updated, error: updateError } = await supabase
    .from("tenants")
    .update({ trial_ends_at: trialEndsAt })
    .eq("id", tenantId)
    .eq("status", "trial")
    .select("id, trial_ends_at")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    return { ok: false, status: 400, error: "Tenant is not on a trial plan" };
  }

  return { ok: true, tenantId: updated.id, trialEndsAt: updated.trial_ends_at };
}
