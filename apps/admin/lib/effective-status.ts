/*
 * What a shop is for its trial and money rules. A paused shop reads
 * `limited`, and the status the pause replaced waits in
 * restrictions.status_before until the pause lifts. Since #1367 the database
 * reads every money rule through tenant_effective_status, so a paused trial is
 * still a trial for its lock, its fees and its end day. The console's own
 * readers of "on trial" read this, the same rule, so Trials, the Merchants
 * digest and the shop page keep a paused trial too.
 */

/** The statuses a pause may stand in for; anything else counts as active. */
const BEFORE_PAUSE = ["trial", "suspended", "cancelled"] as const;

function statusBefore(restrictions: unknown): unknown {
  if (typeof restrictions !== "object" || restrictions === null || !("status_before" in restrictions)) return undefined;
  return restrictions.status_before;
}

/**
 * A paused (limited) shop is what it was before the pause; every other shop
 * is its status. A pause written before status_before existed counts as
 * active, as the database counts it (tenant_effective_status, migration
 * 20261117102504).
 */
export function effectiveStatus(status: string, restrictions: unknown): string {
  if (status !== "limited") return status;
  const before = statusBefore(restrictions);
  return BEFORE_PAUSE.find((s) => s === before) ?? "active";
}

/** A paused shop that was on trial when it was paused. */
export function isPausedTrial(status: string, restrictions: unknown): boolean {
  return status === "limited" && effectiveStatus(status, restrictions) === "trial";
}

/** The same "on trial" as a PostgREST `or` filter on tenants: on trial, or paused while on trial. */
export const ON_TRIAL_FILTER = "status.eq.trial,and(status.eq.limited,restrictions->>status_before.eq.trial)";
