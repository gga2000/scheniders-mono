import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole, isPlatformAdminRole } from "@/lib/permissions";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";

export type RequestCaller =
    | { ok: true; userId: string; tenantId: string; role: string; memberRole: string | null }
    | { ok: false; response: NextResponse };

type Requirement = "member" | "tenant-admin" | "platform-admin";

function deny(status: number, error: string): { ok: false; response: NextResponse } {
    return { ok: false, response: NextResponse.json({ success: false, error }, { status }) };
}

/**
 * Authorize a Route Handler request. Middleware does not run on `/api`, so a
 * route that skips this is open to the internet.
 *
 * The caller is proven by the `Authorization: Bearer` access token; the tenant
 * is their active, membership-verified tenant — never a value from the request.
 */
export async function requireRequestCaller(
    request: Request,
    requirement: Requirement,
): Promise<RequestCaller> {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return deny(401, "Unauthorized");

    const { user, error } = await verifyAccessToken(token);
    if (error || !user) return deny(401, "Unauthorized");

    const active = await resolveActiveTenant(user.id);
    if (!active.ok) return deny(active.status, active.error);

    const platformAdmin = isPlatformAdminRole(active.role);
    if (requirement === "platform-admin" && !platformAdmin) {
        return deny(403, "This action requires a platform administrator.");
    }
    if (requirement === "tenant-admin" && !platformAdmin && !isAdminRole(active.memberRole)) {
        return deny(403, "This action requires an administrator.");
    }

    return { ok: true, userId: user.id, tenantId: active.tenantId, role: active.role, memberRole: active.memberRole };
}
