import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether an admin of `tenantId` may hand out a "link Google" sign-in for
 * `targetUserId`. The link signs whoever opens it in AS the target, so it is
 * only safe for an account whose whole reach is this one store and below the
 * admin's own rights:
 *  - an active member of this store, and of no other store (any status: a
 *    suspended membership elsewhere can be restored and must not be reachable
 *    from here);
 *  - not a store admin (an admin can sign in and link Google themselves);
 *  - not a platform administrator: neither user_profiles.role 'super_admin'
 *    nor any admin_users row (admin-console staff, whatever their role).
 * A failed read counts as "not allowed".
 */
export async function linkTargetAllowed(
    admin: SupabaseClient,
    targetUserId: string,
    tenantId: string,
): Promise<boolean> {
    const [
        { data: memberships, error: membershipError },
        { data: profile, error: profileError },
        { data: consoleStaff, error: consoleStaffError },
    ] = await Promise.all([
        admin.from("tenant_members").select("tenant_id, role, status").eq("user_id", targetUserId),
        admin.from("user_profiles").select("role").eq("id", targetUserId).maybeSingle(),
        admin.from("admin_users").select("user_id").eq("user_id", targetUserId).maybeSingle(),
    ]);
    if (membershipError || profileError || consoleStaffError || !memberships || !profile) return false;
    if (profile.role === "super_admin" || consoleStaff) return false;
    if (memberships.some((m) => m.tenant_id !== tenantId)) return false;
    const here = memberships.find((m) => m.tenant_id === tenantId);
    return here?.status === "active" && here.role !== "admin";
}
