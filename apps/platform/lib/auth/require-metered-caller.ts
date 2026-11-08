import { NextResponse } from "next/server";
import { requireRequestCaller, type RequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createSupabaseServerClientWithToken } from "@/lib/supabase-server";
import type { PermissionKey } from "@/lib/permissions";

type Meter = {
    /** Rate-limit bucket name, e.g. "ai-product-copy". */
    bucket: string;
    limit: number;
    windowSeconds: number;
    /**
     * Staff permission the caller must hold in the store. Checked before the
     * meter is charged, so a refused caller never spends the store's budget.
     */
    permission?: PermissionKey;
};

/**
 * Authorize a route that spends platform money per call (paid AI APIs,
 * headless Chrome). The caller must be an active member of a store, and the
 * store's spend is capped per window.
 *
 * A signed-in user with no store is refused: anyone can create an account, so
 * "has a valid token" alone would let an outsider spend on the platform's keys.
 *
 * Unlike free routes, this fails CLOSED when the limiter is down: refusing a
 * paid call briefly is cheaper than an unbounded bill.
 */
export async function requireMeteredCaller(
    request: Request,
    meter: Meter,
): Promise<RequestCaller> {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller;

    if (meter.permission) {
        // has_tenant_permission reads auth.uid(), so it runs as the caller.
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const { data: allowed, error } = await createSupabaseServerClientWithToken(token).rpc("has_tenant_permission", {
            p_tenant_id: caller.tenantId,
            p_permission: meter.permission,
        });
        if (error) {
            console.error(`[${meter.bucket}] permission check failed: ${error.message}`);
            return {
                ok: false,
                response: NextResponse.json({ error: "Busy right now. Try again in a minute." }, { status: 503 }),
            };
        }
        if (allowed !== true) {
            return {
                ok: false,
                response: NextResponse.json({ success: false, error: "Your role cannot do this." }, { status: 403 }),
            };
        }
    }

    const result = await consumeRateLimit(
        `${meter.bucket}:${caller.tenantId}`,
        meter.limit,
        meter.windowSeconds,
    );
    if (result.error) {
        console.error(`[${meter.bucket}] rate limiter unavailable: ${result.error}`);
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Busy right now. Try again in a minute." },
                { status: 503 },
            ),
        };
    }
    if (!result.allowed) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: `Too many requests. Try again in ${result.retryAfterSeconds}s.` },
                { status: 429, headers: rateLimitHeaders(result, meter.limit) },
            ),
        };
    }
    return caller;
}
