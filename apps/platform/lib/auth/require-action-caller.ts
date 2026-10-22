import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole, isPlatformAdminRole, resolveEffectiveRole } from "@/lib/permissions";
import { activeMembershipRole } from "@/lib/auth/active-tenant-role";

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

/** A read failed: say so, instead of a wrong "deactivated" or "not a member". */
export const ACCOUNT_CHECK_FAILED = "Could not verify your account, try again";

type CallerProfile = { role: string | null; is_active: boolean | null; current_tenant_id: string | null };

type VerifiedCaller =
    | { ok: true; userId: string; profile: CallerProfile | null }
    | { ok: false; error: string };

/**
 * Verifies the token and reads the caller's profile ONCE (role, is_active and
 * current_tenant_id), so the deactivation, platform-admin and active-tenant
 * checks share one read.
 * Deactivation revokes neither the session nor the refresh token, so a valid
 * token alone does not mean the owner may still act (F-087).
 */
async function verifyCaller(accessToken: string | undefined): Promise<VerifiedCaller> {
    if (!accessToken) return { ok: false, error: "Unauthorized" };
    const { user, error } = await verifyAccessToken(accessToken);
    if (error || !user) return { ok: false, error: "Unauthorized" };

    const supabase = createSupabaseServiceClient();
    const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("role, is_active, current_tenant_id")
        .eq("id", user.id)
        .maybeSingle();
    if (profileError) return { ok: false, error: ACCOUNT_CHECK_FAILED };
    const profile = (data as CallerProfile | null) ?? null;
    if (profile?.is_active === false) return { ok: false, error: "Account deactivated" };
    return { ok: true, userId: user.id, profile };
}

/**
 * Platform-level admin, which may act across tenants. Only `super_admin`
 * qualifies: every self-serve signup holds `user_profiles.role = 'admin'`, so
 * reading `admin` as platform-wide handed every new account every tenant.
 */
function isPlatformAdmin(caller: { profile: CallerProfile | null }): boolean {
    return isPlatformAdminRole(caller.profile?.role ?? undefined);
}

/**
 * The caller's role in `tenantId`: an active membership, with the profile half
 * of the rule (exists, not deactivated) already proven by verifyCaller.
 */
async function callerTenantRole(
    caller: { userId: string; profile: CallerProfile | null },
    tenantId: string,
): Promise<{ ok: true; role: string | null } | { ok: false }> {
    if (!caller.profile) return { ok: true, role: null };
    return activeMembershipRole(caller.userId, tenantId);
}

/** The caller, proven by their access token, whose profile is not deactivated. */
export async function requireVerifiedCaller(accessToken: string | undefined): Promise<AuthResult> {
    const caller = await verifyCaller(accessToken);
    return caller.ok ? { ok: true, userId: caller.userId } : caller;
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
    const caller = await verifyCaller(accessToken);
    if (!caller.ok) return caller;
    if (!tenantId) return { ok: false, error: "No account specified." };

    if (isPlatformAdmin(caller)) return { ok: true, userId: caller.userId };

    const membership = await callerTenantRole(caller, tenantId);
    if (!membership.ok) return { ok: false, error: ACCOUNT_CHECK_FAILED };
    if (!membership.role) return { ok: false, error: "You are not a member of this account." };
    if (!isAdminRole(membership.role)) return { ok: false, error: "This action requires an administrator." };

    return { ok: true, userId: caller.userId };
}

/** As above, but membership alone — no admin requirement. */
export async function requireTenantMemberFor(
    accessToken: string | undefined,
    tenantId: string | null | undefined,
): Promise<AuthResult> {
    const caller = await verifyCaller(accessToken);
    if (!caller.ok) return caller;
    if (!tenantId) return { ok: false, error: "No account specified." };

    if (isPlatformAdmin(caller)) return { ok: true, userId: caller.userId };
    const membership = await callerTenantRole(caller, tenantId);
    if (!membership.ok) return { ok: false, error: ACCOUNT_CHECK_FAILED };
    if (!membership.role) return { ok: false, error: "You are not a member of this account." };
    return { ok: true, userId: caller.userId };
}

/** The caller is a platform admin (`super_admin`). */
export async function requirePlatformAdmin(accessToken: string | undefined): Promise<AuthResult> {
    const caller = await verifyCaller(accessToken);
    if (!caller.ok) return caller;
    if (!isPlatformAdmin(caller)) {
        return { ok: false, error: "This action requires a platform administrator." };
    }
    return { ok: true, userId: caller.userId };
}

export type TenantAuthResult =
    | { ok: true; userId: string; tenantId: string }
    | { ok: false; error: string };

/**
 * The caller administers their active tenant — or is a platform admin acting
 * in it — and `targetUserId` is an active member of that tenant. For per-user
 * settings such as permission overrides, which are scoped to one tenant: the
 * tenant is the caller's server-verified active tenant (the
 * `resolveActiveTenant` rule: `current_tenant_id` counts only with an active
 * membership there, or for a platform admin), never one named by the client,
 * and it is returned so the write uses it.
 */
export async function requireAdminOverUser(
    accessToken: string | undefined,
    targetUserId: string | null | undefined,
): Promise<TenantAuthResult> {
    const caller = await verifyCaller(accessToken);
    if (!caller.ok) return caller;
    if (!targetUserId) return { ok: false, error: "No user specified." };

    const tenantId = caller.profile?.current_tenant_id;
    if (!tenantId) return { ok: false, error: "No active tenant" };
    const membership = await callerTenantRole(caller, tenantId);
    if (!membership.ok) return { ok: false, error: ACCOUNT_CHECK_FAILED };
    const role = resolveEffectiveRole(caller.profile?.role, membership.role);
    if (!role) return { ok: false, error: "You are not a member of this account." };
    if (!isAdminRole(role)) return { ok: false, error: "This action requires an administrator." };

    const target = await activeMembershipRole(targetUserId, tenantId);
    if (!target.ok) return { ok: false, error: ACCOUNT_CHECK_FAILED };
    if (!target.role) return { ok: false, error: "That user is not a member of your account." };
    return { ok: true, userId: caller.userId, tenantId };
}
