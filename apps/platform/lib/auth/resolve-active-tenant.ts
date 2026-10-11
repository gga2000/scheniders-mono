import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { isPlatformAdminRole } from "@/lib/permissions";

export type ActiveTenant =
    | { ok: true; tenantId: string; role: string }
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

    // Deny by default: an absent/NULL role must not inherit any access.
    const role = (profile?.role as string | undefined) ?? "";
    if (isPlatformAdminRole(role)) return { ok: true, tenantId, role };

    const { data: membership } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    if (!membership) return { ok: false, error: "You are not a member of this account.", status: 403 };

    return { ok: true, tenantId, role };
}
