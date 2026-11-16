import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { isAdminRole, type UserRole } from "@/lib/permissions";
import { resolveActiveTenant, SUPPORT_VIEW_READ_ONLY } from "@/lib/auth/resolve-active-tenant";
import { billingLockRefusal } from "@/lib/billing/lock-refusal";

export type RequestCaller =
    /** `role` is the caller's effective role in `tenantId` (see resolveActiveTenant). */
    | { ok: true; userId: string; email?: string; tenantId: string; role: UserRole; platformAdmin: boolean; readOnly: boolean }
    | { ok: false; response: NextResponse };

const READ_METHODS = new Set(["GET", "HEAD"]);

type Requirement = "member" | "tenant-admin" | "platform-admin";

export type CallerOptions = {
    /**
     * The route belongs to a page a billing-locked store cannot use (Fermi A1:
     * everything but orders, shipping, labels, export, returns and paying), so
     * a locked store gets 402 here as well as the lock screen.
     */
    refuseWhileLocked?: boolean;
};

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
    options: CallerOptions = {},
): Promise<RequestCaller> {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return deny(401, "Unauthorized");

    const { user, error } = await verifyAccessToken(token);
    if (error || !user) return deny(401, "Unauthorized");

    const active = await resolveActiveTenant(user.id);
    if (!active.ok) return deny(active.status, active.error);

    // A look-only support view reads and never writes, whatever the route.
    if (active.readOnly && !READ_METHODS.has(request.method.toUpperCase())) {
        return deny(403, SUPPORT_VIEW_READ_ONLY);
    }

    if (requirement === "platform-admin" && !active.platformAdmin) {
        return deny(403, "This action requires a platform administrator.");
    }
    // super_admin counts as an admin of every tenant.
    if (requirement === "tenant-admin" && !isAdminRole(active.role)) {
        return deny(403, "This action requires an administrator.");
    }

    if (options.refuseWhileLocked) {
        const refusal = await billingLockRefusal(active.tenantId);
        if (refusal) return { ok: false, response: refusal };
    }

    return {
        ok: true,
        userId: user.id,
        email: user.email,
        tenantId: active.tenantId,
        role: active.role,
        platformAdmin: active.platformAdmin,
        readOnly: active.readOnly,
    };
}
