"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function toggleRolePermissionAction(
    role: string,
    permission: string,
    grant: boolean
): Promise<{ success: boolean; error?: string }> {
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
