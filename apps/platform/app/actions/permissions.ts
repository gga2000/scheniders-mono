"use server";

import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole } from "@/lib/permissions";

/**
 * Permission mutations are platform-wide: `role_permissions` and
 * `user_permissions` have no tenant column, so a single call changes what a
 * role can do everywhere. These actions are public POST endpoints, so each one
 * verifies the caller's token and requires an admin role before writing.
 */
async function requireAdmin(
    accessToken: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!accessToken) return { ok: false, error: "Unauthorized" };

    const { user, error } = await verifyAccessToken(accessToken);
    if (error || !user) return { ok: false, error: "Unauthorized" };

    const supabase = createSupabaseServiceClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (!isAdminRole(profile?.role as string | undefined)) {
        return { ok: false, error: "Forbidden" };
    }
    return { ok: true };
}

export async function toggleRolePermissionAction(
    role: string,
    permission: string,
    grant: boolean,
    accessToken: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await requireAdmin(accessToken);
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
    const auth = await requireAdmin(accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

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
