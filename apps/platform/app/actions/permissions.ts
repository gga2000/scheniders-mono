"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminOverUser, requirePlatformAdmin } from "@/lib/auth/require-action-caller";

/**
 * Permission mutations are public POST endpoints that write with the service
 * role, so each one verifies the caller before writing.
 *
 * `role_permissions` has no tenant column: one call changes what a role can do
 * in every tenant, so only a platform admin may change it. Every self-serve
 * signup is an `admin` of its own tenant, and this used to accept any `admin`.
 * A `user_permissions` override targets one user in one tenant, so a tenant
 * admin may set it for members of their active tenant. The tenant comes from
 * the server-verified active tenant, never from the client.
 */

export async function toggleRolePermissionAction(
    role: string,
    permission: string,
    grant: boolean,
    accessToken: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await requirePlatformAdmin(accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = createSupabaseServiceClient();

    try {
        if (grant) {
            const { error } = await supabase
                .from("role_permissions")
                .insert({ role, permission });
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from("role_permissions")
                .delete()
                .match({ role, permission });
            if (error) throw error;
        }
        return { success: true };
    } catch (err: unknown) {
        console.error("Error toggling role permission:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to update permission"
        };
    }
}

export async function toggleUserOverrideAction(
    userId: string,
    permission: string,
    grant: boolean | null, // null means delete the override
    accessToken: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await requireAdminOverUser(accessToken, userId);
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = createSupabaseServiceClient();

    try {
        if (grant === null) {
            // Remove override
            const { error } = await supabase
                .from("user_permissions")
                .delete()
                .match({ tenant_id: auth.tenantId, user_id: userId, permission });
            if (error) throw error;
        } else {
            // Create or update override
            const { error } = await supabase
                .from("user_permissions")
                .upsert(
                    { tenant_id: auth.tenantId, user_id: userId, permission, is_granted: grant },
                    { onConflict: "tenant_id,user_id,permission" },
                );
            if (error) throw error;
        }
        return { success: true };
    } catch (err: unknown) {
        console.error("Error toggling user override:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to update user override"
        };
    }
}
