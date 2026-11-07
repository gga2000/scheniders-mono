import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import type { UserRole } from "@/lib/permissions";

/**
 * Whether this store may use the one platform Al-Waseet account. Every
 * /api/waseet route talks to that single account (its invoices, parcels and
 * city map), so a store not listed in WASEET_SHARED_ACCOUNT_TENANT_IDS would
 * otherwise read or change another store's courier business.
 */
export function waseetAccountAllows(tenantId: string): boolean {
    const allowed = (env.WASEET_SHARED_ACCOUNT_TENANT_IDS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes(tenantId.toLowerCase());
}

/** Look-ups (cities, regions, statuses, the city map): anyone on the team who ships. */
export const WASEET_READ_ROLES: readonly UserRole[] = ["admin", "super_admin", "employee"];
/** The account's invoices and money: store admins only. */
export const WASEET_MONEY_ROLES: readonly UserRole[] = ["admin", "super_admin"];
/** Changing what every store on the account shares: store admins only. */
export const WASEET_ADMIN_ROLES: readonly UserRole[] = ["admin", "super_admin"];

export type WaseetCaller =
    | { ok: true; userId: string; tenantId: string; role: UserRole }
    | { ok: false; response: NextResponse };

/**
 * The caller of a /api/waseet route: a signed-in active member, with one of
 * `roles` in their current store, of a store allowed the shared account.
 */
export async function authorizeWaseetCaller(request: NextRequest, roles: readonly UserRole[]): Promise<WaseetCaller> {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
        return { ok: false, response: NextResponse.json({ success: false, error: "Missing Authorization header" }, { status: 401 }) };
    }
    const { user, error } = await verifyAccessToken(token);
    if (error || !user) {
        return { ok: false, response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
    }
    const active = await resolveActiveTenant(user.id);
    if (!active.ok) {
        return { ok: false, response: NextResponse.json({ success: false, error: active.error }, { status: active.status }) };
    }
    if (!roles.includes(active.role)) {
        return { ok: false, response: NextResponse.json({ success: false, error: "You do not have permission for this" }, { status: 403 }) };
    }
    if (!waseetAccountAllows(active.tenantId)) {
        return {
            ok: false,
            response: NextResponse.json({ success: false, error: "This store is not set up to use Al-Waseet" }, { status: 403 }),
        };
    }
    return { ok: true, userId: user.id, tenantId: active.tenantId, role: active.role };
}
