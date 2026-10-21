import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { isPlatformAdminRole, resolveEffectiveRole, type UserRole } from "@/lib/permissions";

/**
 * `role` is the caller's effective role in this tenant: their
 * `tenant_members.role`, or `super_admin` for platform staff (the only thing
 * the global `user_profiles.role` still decides). `platformAdmin` marks the
 * latter, who may act in a tenant they do not belong to.
 */
export type ActiveTenant =
    | { ok: true; tenantId: string; role: UserRole; platformAdmin: boolean }
    | { ok: false; error: string; status: 400 | 403 };

/**
 * The tenant a verified user is acting in, for server code that writes with the
 * service role.
 *
 * `user_profiles.current_tenant_id` is the user's own row and they can update
 * it through PostgREST, so on its own it proves nothing: a signup could point
 * it at another tenant and every service-role route that trusted it would act
 * on that tenant. The value is accepted only when the user is an active member
 * of that tenant (or a platform admin).
 */
export async function resolveActiveTenant(userId: string): Promise<ActiveTenant> {
    const supabase = createSupabaseServiceClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("current_tenant_id, role, is_active")
        .eq("id", userId)
        .maybeSingle();

    // Deactivating a user is a soft flag and does not revoke their session, so
    // it has to be checked on every call.
    if (profile?.is_active === false) return { ok: false, error: "Account deactivated", status: 403 };

    const tenantId = profile?.current_tenant_id as string | undefined;
    if (!tenantId) return { ok: false, error: "No active tenant", status: 400 };

    const { data: membership } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    // Deny by default: no active membership (or an unknown role value) is no role.
    const platformRole = profile?.role as string | undefined;
    const role = resolveEffectiveRole(platformRole, (membership as { role: string } | null)?.role);
    if (!role) return { ok: false, error: "You are not a member of this account.", status: 403 };

    return { ok: true, tenantId, role, platformAdmin: isPlatformAdminRole(platformRole) };
}
