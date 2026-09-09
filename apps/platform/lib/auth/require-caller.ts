import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserTenantRole } from "@/lib/tenant";

// Server-only. Reads the session cookie via next/headers and must never be
// imported into a client component. (The repo marks this with a comment rather
// than the `server-only` package, which is not a dependency here.)

/**
 * ORD-A12. Authentication guards for Server Actions.
 *
 * A Next.js Server Action is an independently addressable HTTP endpoint. The
 * component that imports it is irrelevant to who may call it: the action id
 * ships in the client bundle, and anyone can POST to it with arbitrary
 * arguments. Gating the page that renders the button gates nothing.
 *
 * Before this module, 11 of the 13 actions in `app/actions/` combined "no auth
 * check" with a service-role client, so RLS was bypassed too — including
 * `toggleRolePermissionAction`, which inserts into `role_permissions`, and
 * `topUpWalletAction`. The reasoning was written down in `telegram-link.ts`:
 * "The Settings → Team page is already gated to admins, so we follow the
 * existing pattern and don't re-verify the caller's role here."
 *
 * Every action must therefore establish its caller from the session cookie —
 * which the client cannot forge, unlike an argument — and authorise against the
 * resource it is about to touch.
 *
 * NEVER trust a tenant id that arrived as an argument. Use `requireTenantMember`
 * or `requireTenantAdmin`, which check the caller against that tenant, or
 * `resolveCallerTenant` to derive it from the session instead.
 */

export class NotAuthenticatedError extends Error {
    constructor() {
        super("Not signed in.");
        this.name = "NotAuthenticatedError";
    }
}

export class NotAuthorizedError extends Error {
    constructor(message = "You do not have permission to do that.") {
        super(message);
        this.name = "NotAuthorizedError";
    }
}

export interface Caller {
    userId: string;
    email: string | null;
}

/** The signed-in caller, from the session cookie. Throws when absent. */
export async function requireCaller(): Promise<Caller> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new NotAuthenticatedError();
    return { userId: data.user.id, email: data.user.email ?? null };
}

/**
 * The caller's active role in `tenantId`, proving membership.
 * Throws when not signed in, or not an active member of that tenant.
 */
export async function requireTenantMember(tenantId: string): Promise<{ caller: Caller; role: string }> {
    const caller = await requireCaller();
    if (!tenantId) throw new NotAuthorizedError("No tenant specified.");
    const role = await getUserTenantRole(caller.userId, tenantId);
    if (!role) throw new NotAuthorizedError("You are not a member of this account.");
    return { caller, role };
}

const ADMIN_ROLES = new Set(["admin", "super_admin", "owner"]);

/** As `requireTenantMember`, and additionally that the caller administers it. */
export async function requireTenantAdmin(tenantId: string): Promise<{ caller: Caller; role: string }> {
    const { caller, role } = await requireTenantMember(tenantId);
    if (!ADMIN_ROLES.has(role)) {
        throw new NotAuthorizedError("This action requires an administrator.");
    }
    return { caller, role };
}

/**
 * The caller's current tenant, derived from the session rather than accepted
 * from the client. Prefer this over a `tenantId` argument wherever the action
 * only ever operates on the caller's own account.
 */
export async function resolveCallerTenant(): Promise<{ caller: Caller; tenantId: string; role: string }> {
    const caller = await requireCaller();
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
        .from("user_profiles")
        .select("current_tenant_id")
        .eq("id", caller.userId)
        .maybeSingle();

    const tenantId = (data as { current_tenant_id: string | null } | null)?.current_tenant_id ?? null;
    if (!tenantId) throw new NotAuthorizedError("No active account selected.");

    const role = await getUserTenantRole(caller.userId, tenantId);
    if (!role) throw new NotAuthorizedError("You are not a member of this account.");
    return { caller, tenantId, role };
}

/** Shape every guarded action returns on refusal, so call sites stay uniform. */
export function authFailure(err: unknown): { success: false; error: string } | null {
    if (err instanceof NotAuthenticatedError || err instanceof NotAuthorizedError) {
        return { success: false, error: err.message };
    }
    return null;
}
