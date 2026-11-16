/**
 * Tenant restriction enforcement.
 *
 * When an admin pauses a merchant, `tenants.status` becomes `'limited'` and
 * `tenants.restrictions` carries the list of blocked actions and an optional
 * `paused_until` window. This module is the single source of truth that
 * server code (route handlers, server actions) consults before performing
 * destructive operations on behalf of a paused tenant.
 *
 * Design notes:
 * - Read-only paths (SELECTs, page renders) MUST NOT call this. Paused
 *   merchants can still see their data.
 * - Active tenants (`status !== 'limited'`) are a no-op.
 * - If `paused_until` has passed, the pause is treated as expired:
 *   we return `null` and best-effort lift the pause in the background
 *   (public.lift_tenant_pause: the status it had before). The caller is
 *   not delayed by the backfill.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-server";

export type RestrictionBlock =
    | "new_orders"
    | "new_products"
    | "team_invites"
    | "storefront_writes";

export interface TenantRestrictions {
    paused_until: string | null;
    paused_at: string | null;
    paused_by: string | null;
    reason: string | null;
    blocks: Partial<Record<RestrictionBlock, boolean>>;
}

export class TenantBlockedError extends Error {
    public readonly status = 423;
    public readonly code = "TENANT_PAUSED";

    constructor(
        public readonly block: RestrictionBlock,
        public readonly restrictions: TenantRestrictions
    ) {
        super(`Tenant action blocked: ${block}`);
        this.name = "TenantBlockedError";
    }
}

/**
 * Best-effort: lift an expired pause. Fire-and-forget; we don't wait.
 *
 * public.lift_tenant_pause gives the shop back the status it had before the
 * pause (trial stays trial, so the trial end and unpaid months still lock it)
 * and empties restrictions. This used to write status 'active' and
 * restrictions NULL itself: the column is NOT NULL, so the write failed, and
 * a lifted trial would have come back as a paying shop.
 */
function clearExpiredRestrictions(tenantId: string): void {
    try {
        const admin = createSupabaseServiceClient();
        // Don't await — the caller has already moved on. Errors logged only.
        void admin
            .rpc("lift_tenant_pause", { _tenant_id: tenantId })
            .then(({ error }) => {
                if (error) {
                    console.warn(
                        `[restrictions] Failed to auto-clear expired pause for tenant ${tenantId}:`,
                        error.message
                    );
                }
            });
    } catch (err) {
        console.warn(`[restrictions] clearExpiredRestrictions threw:`, err);
    }
}

/**
 * Fetch active restrictions for a tenant, or null if not limited.
 *
 * Returns null in three cases:
 *  1. Tenant not found.
 *  2. Status is not `'limited'`.
 *  3. Status is `'limited'` but `paused_until` has elapsed (we
 *     simultaneously lift the pause in the background).
 */
export async function getActiveRestrictions(
    tenantId: string
): Promise<TenantRestrictions | null> {
    if (!tenantId) return null;

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin
        .from("tenants")
        .select("status, restrictions")
        .eq("id", tenantId)
        .maybeSingle();

    if (error || !data) return null;
    if (data.status !== "limited") return null;

    const raw = (data.restrictions ?? null) as Partial<TenantRestrictions> | null;
    const restrictions: TenantRestrictions = {
        paused_until: raw?.paused_until ?? null,
        paused_at: raw?.paused_at ?? null,
        paused_by: raw?.paused_by ?? null,
        reason: raw?.reason ?? null,
        blocks: raw?.blocks ?? {},
    };

    // If pause has expired, auto-clear and report no active restrictions.
    if (restrictions.paused_until) {
        const until = Date.parse(restrictions.paused_until);
        if (!Number.isNaN(until) && until <= Date.now()) {
            clearExpiredRestrictions(tenantId);
            return null;
        }
    }

    return restrictions;
}

/**
 * Throws `TenantBlockedError` if the given block is on for this tenant.
 * No-op for active tenants.
 *
 * Call this at the top of any write-path handler before touching the DB.
 */
export async function assertNotBlocked(
    tenantId: string,
    block: RestrictionBlock
): Promise<void> {
    const restrictions = await getActiveRestrictions(tenantId);
    if (!restrictions) return;
    if (restrictions.blocks?.[block] === true) {
        throw new TenantBlockedError(block, restrictions);
    }
}

/**
 * Convenience for route handlers: convert a TenantBlockedError into
 * the standard 423 JSON response shape.
 */
export function blockedResponseBody(err: TenantBlockedError) {
    return {
        error: err.message,
        code: err.code,
        block: err.block,
        paused_until: err.restrictions.paused_until,
        reason: err.restrictions.reason,
    };
}
