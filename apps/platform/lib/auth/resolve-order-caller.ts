import { verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";

/**
 * Server actions are public POST endpoints — anyone who can read the client
 * bundle can invoke them. Every mutating order action therefore verifies the
 * caller's access token and derives the tenant from their own profile.
 *
 * The tenant is NEVER taken from an argument: a client-supplied tenant id let
 * any signed-in user write into any other tenant, and a null one skipped the
 * pause / plan-limit / wallet-charge guards entirely.
 */
export type Caller = { userId: string; tenantId: string; role: string };

/** Roles permitted to mutate orders. `viewer` is read-only. */
export const ORDER_WRITE_ROLES = ["admin", "super_admin", "employee"];

export async function resolveCaller(
    accessToken: string | undefined,
): Promise<{ caller: Caller } | { error: string }> {
    if (!accessToken) return { error: "Unauthorized" };

    const { user, error } = await verifyAccessToken(accessToken);
    if (error || !user) return { error: "Unauthorized" };

    // The tenant comes from the caller's own profile and is accepted only while
    // they are an active member of it (resolveActiveTenant).
    const active = await resolveActiveTenant(user.id);
    if (!active.ok) return { error: active.error };

    return { caller: { userId: user.id, tenantId: active.tenantId, role: active.role } };
}
