import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Deactivating a user (`user_profiles.is_active = false`) is a soft flag: it
 * leaves their `tenant_members` row at status 'active' and revokes neither
 * their session nor their refresh token. So every server-side check that grants
 * a tenant role has to read the profile too, or a deactivated admin keeps admin
 * rights wherever the check runs with the service role (F-087).
 *
 * The rule is the database's (`get_user_tenant_ids()`, `is_tenant_admin()`):
 * an active membership joined to a profile with `coalesce(is_active, true)`.
 * A NULL `is_active` counts as active; a missing profile or a failed read does
 * not.
 */

/**
 * The user's role from an active `tenant_members` row in `tenantId`, without
 * the profile half of the rule. Only for callers that have already read the
 * user's profile and know it exists and is active (require-action-caller).
 * `ok: false` means the read failed, as distinct from "not a member".
 */
export async function activeMembershipRole(
    userId: string,
    tenantId: string,
): Promise<{ ok: true; role: string | null } | { ok: false }> {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, role: data?.role ?? null };
}

/**
 * The user's role in `tenantId` when both their membership and their profile
 * are active, otherwise null (a failed read also gives null: fail closed).
 */
export async function activeTenantRole(userId: string, tenantId: string): Promise<string | null> {
    const supabase = createSupabaseServiceClient();
    const [membership, profile] = await Promise.all([
        activeMembershipRole(userId, tenantId),
        supabase.from("user_profiles").select("is_active").eq("id", userId).maybeSingle(),
    ]);
    if (!membership.ok || profile.error || !profile.data) return null;
    if (profile.data.is_active === false) return null;
    return membership.role;
}
