// =====================================================================
// Rate limiting for public storefront routes
// =====================================================================
// Backed by `consume_rate_limit` — one atomic upsert in Postgres, so the
// decision is correct across serverless instances with no new infrastructure
// (INT-4). The platform app has its own wrapper: the two apps build their
// service clients differently, and `packages/shared` must not depend on
// either app's Supabase wiring. The SQL function is the shared part.
//
// What happens when the limiter cannot answer is the CALLER's decision, and
// every call states it — there is no default:
//
//   - "fail-closed": refuse. For routes that are oracles an attacker would
//     like to query without bound (referral codes); when the limiter cannot
//     answer, the database behind the route cannot either, so refusing loses
//     nothing a real shopper had.
//   - "fail-open": serve, and log. For routes where the protected check is
//     already enforced in SQL and an outage of the limiter alone must not
//     take a shopper-facing feature down (order tracking: ownership is
//     proven by order number + phone inside `lookup_order`).
// =====================================================================

import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type RateLimitFailureMode = "fail-closed" | "fail-open";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets, for a Retry-After header. 0 when unknown. */
  retryAfterSeconds: number;
}

/** Consume one unit from `key`'s window of `limit` per `windowSeconds`. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  onUnavailable: RateLimitFailureMode,
): Promise<RateLimitResult> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) {
    console.error(
      `[rate-limit] limiter unavailable (${onUnavailable}):`,
      error?.message ?? "no row",
    );
    return onUnavailable === "fail-open"
      ? { allowed: true, remaining: limit, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: 0 };
  }
  const resetAt = Date.parse(row.reset_at);
  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: Number.isFinite(resetAt)
      ? Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
      : 0,
  };
}

/**
 * A limiter key segment for one tenant's phone number: the last ten digits,
 * hashed with the tenant id, so the limiter table never holds a raw number and
 * 07…, +9647… and 9647… land in the same bucket.
 */
export function phoneBucket(tenantId: string, phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return createHash("sha256").update(`${tenantId}:${digits}`).digest("hex").slice(0, 32);
}

/** The caller's address as the edge reports it (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
