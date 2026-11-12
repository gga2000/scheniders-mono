import { NextResponse } from "next/server";
import { createSupabaseServerClientWithToken } from "@/lib/supabase-server";
import type { PermissionKey } from "@/lib/permissions";

export type PermissionCheck = { ok: true } | { ok: false; response: NextResponse };

/**
 * Check a staff permission for the caller in their store, the same way the
 * database does: per-user overrides first, then the role's defaults, and only
 * while the member and their profile are active.
 *
 * Routes that write through the service-role client skip the database's own
 * permission triggers, so they must call this. A role-name check is not
 * enough: it ignores a revoked per-user permission.
 *
 * has_tenant_permission reads auth.uid(), so it runs with the caller's token.
 * Platform admins are not store members and pass on `platformAdmin`.
 */
export async function callerHasPermission(
    request: Request,
    caller: { tenantId: string; platformAdmin: boolean },
    permission: PermissionKey,
    label: string,
): Promise<PermissionCheck> {
    if (caller.platformAdmin) return { ok: true };
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: allowed, error } = await createSupabaseServerClientWithToken(token).rpc("has_tenant_permission", {
        p_tenant_id: caller.tenantId,
        p_permission: permission,
    });
    if (error) {
        console.error(`[${label}] permission check failed: ${error.message}`);
        return {
            ok: false,
            response: NextResponse.json({ success: false, error: "Busy right now. Try again in a minute." }, { status: 503 }),
        };
    }
    if (allowed !== true) {
        return {
            ok: false,
            response: NextResponse.json({ success: false, error: "Your role cannot do this." }, { status: 403 }),
        };
    }
    return { ok: true };
}
