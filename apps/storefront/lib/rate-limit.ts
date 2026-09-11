// =====================================================================
// Rate limiting for public storefront routes
// =====================================================================
// Backed by `consume_rate_limit` — one atomic upsert in Postgres, so the
// decision is correct across serverless instances with no new infrastructure
// (INT-4). The platform app has its own copy of this wrapper: the two apps
// build their service clients differently, and `packages/shared` must not
// depend on either app's Supabase wiring. The SQL function is the shared part.
// =====================================================================

import { createSupabaseServiceClient } from "@/lib/supabase/server";

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
}

/**
 * Consume one unit from `key`'s window.
 *
 * Fails **open** on an infrastructure error. A broken limiter must not take a
 * storefront down; the request is served and the failure is logged rather than
 * swallowed.
 */
export async function consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    try {
        const supabase = createSupabaseServiceClient();
        const { data, error } = await supabase
            .rpc("consume_rate_limit", {
                _key: key,
                _limit: limit,
                _window_seconds: windowSeconds,
            })
            .single<{ allowed: boolean; remaining: number; reset_at: string }>();

        if (error || !data) {
            console.error("[rate-limit] limiter unavailable:", error?.message);
            return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
        }

        const resetAt = new Date(data.reset_at).getTime();
        return {
            allowed: data.allowed,
            remaining: data.remaining,
            retryAfterSeconds: Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)),
        };
    } catch (e) {
        console.error("[rate-limit] limiter threw:", e);
        return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
}
