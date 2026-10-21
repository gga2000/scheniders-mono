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
 * The user's role in `tenantId` when both their membership and their profile
 * are active, otherwise null.
 */
export async function activeTenantRole(userId: string, tenantId: string): Promise<string | null> {
    const supabase = createSupabaseServiceClient();
    const [membership, profile] = await Promise.all([
        supabase
            .from("tenant_members")
            .select("role")
            .eq("tenant_id", tenantId)
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle(),
        supabase.from("user_profiles").select("is_active").eq("id", userId).maybeSingle(),
    ]);
    if (membership.error || profile.error) return null;
    if (!membership.data || !profile.data) return null;
    if (profile.data.is_active === false) return null;
    return membership.data.role;
}

/**
 * True when the user's profile has been deactivated, or cannot be read (fail
 * closed). A user without a profile row is not "deactivated": they simply hold
 * no tenant role, which `activeTenantRole` already refuses.
 */
export async function isProfileDeactivated(userId: string): Promise<boolean> {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
        .from("user_profiles")
        .select("is_active")
        .eq("id", userId)
        .maybeSingle();
    if (error) return true;
    return data?.is_active === false;
}
