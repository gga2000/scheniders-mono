import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Server-side rate limiting, backed by Postgres.
 *
 * INT-4. This was initially left open on the grounds that the app has no shared
 * store, and that a per-instance counter on serverless would be a guard in name
 * only. That missed the obvious: Postgres already is a shared store. The whole
 * decision is one atomic `INSERT ... ON CONFLICT` in `consume_rate_limit`, so
 * concurrent requests landing on different instances cannot both read a stale
 * count. No new infrastructure to provision.
 */

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetAt: Date | null;
    /** Seconds until the window resets, for a Retry-After header. */
    retryAfterSeconds: number;
};

/**
 * Consume one unit from `key`'s window.
 *
 * Fails **open** on an infrastructure error: if the limiter itself is broken we
 * would rather serve the request than take the feature down, and the failure is
 * surfaced by the caller rather than swallowed.
 */
export async function consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
): Promise<RateLimitResult & { error?: string }> {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
        .rpc("consume_rate_limit", {
            _key: key,
            _limit: limit,
            _window_seconds: windowSeconds,
        })
        .single<{ allowed: boolean; remaining: number; reset_at: string }>();

    if (error || !data) {
        return {
            allowed: true,
            remaining: limit,
            resetAt: null,
            retryAfterSeconds: 0,
            error: error?.message ?? "rate limiter returned no row",
        };
    }

    const resetAt = new Date(data.reset_at);
    const retryAfterSeconds = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

    return { allowed: data.allowed, remaining: data.remaining, resetAt, retryAfterSeconds };
}

/** Headers describing the limit, so a client can back off intelligently. */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
    const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(result.remaining),
    };
    if (result.resetAt) {
        headers["X-RateLimit-Reset"] = String(Math.floor(result.resetAt.getTime() / 1000));
    }
    if (!result.allowed && result.retryAfterSeconds > 0) {
        headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return headers;
}
