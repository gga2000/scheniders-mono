import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole } from "@/lib/permissions";

/**
 * Authorization for Server Actions that operate on a named tenant.
 *
 * A Next.js Server Action is an independently addressable HTTP endpoint: the
 * action id ships in the client bundle and anyone can POST to it with arbitrary
 * arguments. The component that imports it is irrelevant to who may call it, so
 * gating the settings page gates nothing.
 *
 * `app/actions/permissions.ts` already established this shape — verify the
 * caller's access token, then check their role — for the platform-wide
 * permission tables. This module extends it to the actions that take a
 * `tenantId`, where proving identity alone is not enough: without a membership
 * check, an admin of one tenant can act on another.
 *
 * The access token is passed as an argument, matching the existing pattern. That
 * is safe because it is a bearer token the server verifies with Supabase — a
 * caller can only present a token they already hold. A tenant id, by contrast,
 * is just a string and must never be trusted on its own.
 */

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

/** The caller, proven by their access token. */
export async function requireVerifiedCaller(accessToken: string | undefined): Promise<AuthResult> {
    if (!accessToken) return { ok: false, error: "Unauthorized" };
    const { user, error } = await verifyAccessToken(accessToken);
    if (error || !user) return { ok: false, error: "Unauthorized" };
    return { ok: true, userId: user.id };
}

/** Platform-level admin (`user_profiles.role`), which may act across tenants. */
async function isPlatformAdmin(userId: string): Promise<boolean> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
    return isAdminRole((data as { role: string } | null)?.role);
}

/** The caller's active role in `tenantId`, or null when not a member. */
async function tenantRole(userId: string, tenantId: string): Promise<string | null> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    return (data as { role: string } | null)?.role ?? null;
}

/**
 * The caller administers `tenantId` — or is a platform admin.
 *
 * Checks membership of the tenant named in the ARGUMENTS, not merely that the
 * caller is an admin somewhere.
 */
export async function requireTenantAdminFor(
    accessToken: string | undefined,
    tenantId: string | null | undefined,
): Promise<AuthResult> {
    const caller = await requireVerifiedCaller(accessToken);
    if (!caller.ok) return caller;
    if (!tenantId) return { ok: false, error: "No account specified." };

    if (await isPlatformAdmin(caller.userId)) return caller;

    const role = await tenantRole(caller.userId, tenantId);
    if (!role) return { ok: false, error: "You are not a member of this account." };
    if (!isAdminRole(role)) return { ok: false, error: "This action requires an administrator." };

    return caller;
}

/** As above, but membership alone — no admin requirement. */
export async function requireTenantMemberFor(
    accessToken: string | undefined,
    tenantId: string | null | undefined,
): Promise<AuthResult> {
    const caller = await requireVerifiedCaller(accessToken);
    if (!caller.ok) return caller;
    if (!tenantId) return { ok: false, error: "No account specified." };

    if (await isPlatformAdmin(caller.userId)) return caller;
    if (!(await tenantRole(caller.userId, tenantId))) {
        return { ok: false, error: "You are not a member of this account." };
    }
    return caller;
}
