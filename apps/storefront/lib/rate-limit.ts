// =====================================================================
// Rate limiting for public storefront routes
// =====================================================================
// Backed by `consume_rate_limit`, one atomic upsert in Postgres, so the
// decision holds across serverless instances with no new infrastructure.
// The platform app has its own copy of this wrapper because the two apps
// build their service clients differently, and `packages/shared` must not
// depend on either app's Supabase wiring. The SQL function is the shared
// part. (Shape taken from PR #80 656ae183.)
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
 * Fails **open** on an infrastructure error. A broken limiter must not take
 * a storefront route down, so the request is served and the failure is
 * logged rather than swallowed.
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
      console.error("[rate-limit] limiter unavailable:", error?.message ?? "no row");
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

/**
 * The caller's IP as the edge reports it: the first `x-forwarded-for` hop,
 * then `x-real-ip`. Returns null when neither is present (local dev), and the
 * caller then simply skips the per-IP bucket.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}
