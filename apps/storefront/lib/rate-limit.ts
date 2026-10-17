// =====================================================================
// Rate limiting for public storefront routes
// =====================================================================
// Backed by `consume_rate_limit` — one atomic upsert in Postgres, so the
// decision is correct across serverless instances with no new infrastructure
// (INT-4). The platform app has its own wrapper: the two apps build their
// service clients differently, and `packages/shared` must not depend on
// either app's Supabase wiring. The SQL function is the shared part.
//
// Fails CLOSED. The routes behind it are oracles an attacker would like to
// query without bound (referral codes); when the limiter cannot answer, the
// database behind the route cannot either, so refusing loses nothing a real
// shopper had.
// =====================================================================

import { createSupabaseServiceClient } from "@/lib/supabase/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Consume one unit from `key`'s window of `limit` per `windowSeconds`. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) {
    console.error("[rate-limit] limiter unavailable:", error?.message ?? "no row");
    return { allowed: false, remaining: 0 };
  }
  return { allowed: row.allowed, remaining: row.remaining };
}

/** The caller's address as the edge reports it (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
