import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createSupabaseServerClientWithToken,
    createSupabaseServiceClient,
    verifyAccessToken,
} from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import type { UserRole } from "@/lib/permissions";

/**
 * Who is calling the MCP endpoint, proven from the bearer token alone.
 *
 * `db` carries the caller's own token, so every query it makes runs under RLS
 * and under the `mcp_request_guard` pre-request check. `tenantId` is their
 * membership-verified active store; no tool ever takes a tenant from Claude.
 */
export type McpCaller = {
    userId: string;
    email: string | null;
    displayName: string;
    tenantId: string;
    role: UserRole;
    clientId: string;
    db: SupabaseClient;
    token: string;
};

/** The claims we read from a token Supabase Auth has already verified. */
const oauthClaimsSchema = z.object({
    sub: z.string().uuid(),
    client_id: z.string().min(1),
});

function decodeClaims(token: string): unknown {
    const payload = token.split(".")[1];
    if (!payload) return null;
    try {
        return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
        // Not a JWT: the caller gets the same 401 as any other bad token.
        return null;
    }
}

/**
 * Token check for `withMcpAuth`. Returns undefined (→ 401 with a
 * WWW-Authenticate challenge, so Claude signs in again) unless the token:
 *   - is valid according to Supabase Auth,
 *   - was issued through the OAuth server (carries `client_id`) — an app
 *     session token pasted into a client would skip the database guard,
 *   - belongs to a user on the `mcp_access` list.
 */
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
    if (!bearerToken) return undefined;

    const claims = oauthClaimsSchema.safeParse(decodeClaims(bearerToken));
    if (!claims.success) return undefined;

    const { user, error } = await verifyAccessToken(bearerToken);
    if (error || !user || user.id !== claims.data.sub) return undefined;

    if (!(await hasMcpAccess(user.id))) return undefined;

    const exp = (decodeClaims(bearerToken) as { exp?: unknown } | null)?.exp;
    return {
        token: bearerToken,
        clientId: claims.data.client_id,
        scopes: [],
        expiresAt: typeof exp === "number" ? exp : undefined,
        extra: { userId: user.id, email: user.email ?? null },
    };
}

/** `mcp_access` is service-role only; this is the one place the app reads it. */
export async function hasMcpAccess(userId: string): Promise<boolean> {
    const { data, error } = await createSupabaseServiceClient()
        .from("mcp_access")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw new Error(`Could not check Claude access: ${error.message}`);
    return data !== null;
}

export type ResolvedCaller = { ok: true; caller: McpCaller } | { ok: false; error: string };

/**
 * Resolve the store and role for one tool call. Done per call, not per token:
 * deactivating a user, removing them from the store or switching their active
 * store takes effect on Claude's next call.
 */
export async function resolveMcpCaller(authInfo: AuthInfo | undefined): Promise<ResolvedCaller> {
    const extra = z.object({ userId: z.string().uuid(), email: z.string().nullable() }).safeParse(authInfo?.extra);
    if (!authInfo || !extra.success) return { ok: false, error: "Not signed in" };

    const active = await resolveActiveTenant(extra.data.userId);
    if (!active.ok) return { ok: false, error: active.error };

    const db = createSupabaseServerClientWithToken(authInfo.token);
    const { data: profile } = await db
        .from("user_profiles")
        .select("display_name")
        .eq("id", extra.data.userId)
        .maybeSingle();

    return {
        ok: true,
        caller: {
            userId: extra.data.userId,
            email: extra.data.email,
            displayName: (profile?.display_name as string | null) || extra.data.email || "Claude",
            tenantId: active.tenantId,
            role: active.role,
            clientId: authInfo.clientId,
            db,
            token: authInfo.token,
        },
    };
}
