"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { authFailure, requireTenantAdmin, resolveCallerTenant } from "@/lib/auth/require-caller";
import { getUserTenantRole } from "@/lib/tenant";

/**
 * ORD-A12. These two actions build a service-role client and write to the
 * permission tables. Before this change neither checked who was calling, and a
 * Server Action is a public HTTP endpoint — so any signed-in user could grant
 * themselves, or anyone, any permission. The caller is now established from the
 * session cookie (which cannot be supplied as an argument) and must administer
 * their own tenant.
 *
 * ORD-A13, still open: `role_permissions` and `user_permissions` carry NO
 * `tenant_id`. They are platform-global, so an admin of one tenant editing them
 * changes permissions for every tenant. Requiring an admin here does not fix
 * that — it only stops non-admins doing it. The real fix is a schema change.
 */

export async function toggleRolePermissionAction(
    role: string,
    permission: string,
    grant: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await resolveCallerTenant();
        await requireTenantAdmin(tenantId);
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }

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
    grant: boolean | null // null means delete the override
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await resolveCallerTenant();
        await requireTenantAdmin(tenantId);

        // The target is an arbitrary user id from the caller. Without this,
        // an admin of one tenant could rewrite permissions for a user in
        // another — the override table is global and has no tenant column.
        const targetRole = await getUserTenantRole(userId, tenantId);
        if (!targetRole) {
            return { success: false, error: "That user is not a member of this account." };
        }
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }

    const supabase = createSupabaseServiceClient();

    try {
        if (grant === null) {
            // Remove override
            const { error } = await supabase
                .from("user_permissions")
                .delete()
                .match({ user_id: userId, permission });
            if (error) throw error;
        } else {
            // Create or update override
            const { error } = await supabase
                .from("user_permissions")
                .upsert({ user_id: userId, permission, is_granted: grant }, { onConflict: "user_id,permission" });
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
