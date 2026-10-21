import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole, isPlatformAdminRole } from "@/lib/permissions";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";

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

/**
 * Platform-level admin, which may act across tenants. Only `super_admin`
 * qualifies: every self-serve signup holds `user_profiles.role = 'admin'`, so
 * reading `admin` as platform-wide handed every new account every tenant.
 */
async function isPlatformAdmin(userId: string): Promise<boolean> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
    return isPlatformAdminRole((data as { role: string } | null)?.role);
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

/** The caller is a platform admin (`super_admin`). */
export async function requirePlatformAdmin(accessToken: string | undefined): Promise<AuthResult> {
    const caller = await requireVerifiedCaller(accessToken);
    if (!caller.ok) return caller;
    if (!(await isPlatformAdmin(caller.userId))) {
        return { ok: false, error: "This action requires a platform administrator." };
    }
    return caller;
}

export type TenantAuthResult =
    | { ok: true; userId: string; tenantId: string }
    | { ok: false; error: string };

/**
 * The caller administers their active tenant — or is a platform admin acting
 * in it — and `targetUserId` is an active member of that tenant. For per-user
 * settings such as permission overrides, which are scoped to one tenant: the
 * tenant is the caller's server-verified active tenant (`resolveActiveTenant`),
 * never one named by the client, and it is returned so the write uses it.
 */
export async function requireAdminOverUser(
    accessToken: string | undefined,
    targetUserId: string | null | undefined,
): Promise<TenantAuthResult> {
    const caller = await requireVerifiedCaller(accessToken);
    if (!caller.ok) return caller;
    if (!targetUserId) return { ok: false, error: "No user specified." };

    const active = await resolveActiveTenant(caller.userId);
    if (!active.ok) return { ok: false, error: active.error };
    if (!isAdminRole(active.role)) return { ok: false, error: "This action requires an administrator." };

    if (!(await tenantRole(targetUserId, active.tenantId))) {
        return { ok: false, error: "That user is not a member of your account." };
    }
    return { ok: true, userId: caller.userId, tenantId: active.tenantId };
}
