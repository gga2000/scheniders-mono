import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Whether a store member holds a staff permission, by the database's own rule
 * (`member_has_permission`: admin, else the per-user override, else the role
 * default; only while the membership and profile are active).
 *
 * For server code that writes with the service role and so skips the
 * database's permission triggers: server actions, the Claude connector, the
 * Telegram bot. A role-name list is not enough, because a store can switch a
 * permission off for one person.
 *
 * Platform staff (`super_admin`, never a store role) may act in any store.
 * A failed check refuses (fail closed) and is logged.
 */
export async function memberHasPermission(
    member: { userId: string; tenantId: string; role: string },
    permission: PermissionKey,
): Promise<boolean> {
    if (member.role === "super_admin") return true;
    const { data, error } = await createSupabaseServiceClient().rpc("member_has_permission", {
        p_tenant_id: member.tenantId,
        p_user_id: member.userId,
        p_permission: permission,
    });
    if (error) {
        console.error(`[permissions] ${permission} check failed: ${error.message}`);
        return false;
    }
    return data === true;
}
