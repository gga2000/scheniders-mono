import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { consumeRateLimit, phoneBucket, type RateLimitResult } from "@/lib/rate-limit";

// =====================================================================
// Loyalty proof — "this phone is the shopper's"
// =====================================================================
// Points are read and spent with the service role (customer_points is
// member-RLS), so whoever asks must first show they are that customer. The
// proof is the one a returning shopper can give and a stranger cannot: an
// order number of THIS store placed with THIS phone, checked by lookup_order
// (the same match order tracking uses).
//
// Both places that act on a phone's points use this one check, with the same
// buckets: /api/loyalty/balance (before it shows a balance) and
// submitCheckout (before it spends one). Sharing the buckets means a guesser
// gets one budget across both, not one each.
//
// Order numbers are sequential, so the pair is guessable only by brute
// force, which the limiter stops. That holds only because lookup_order is
// executable by service_role alone (migration 20261021090300). Buckets are
// per IP, per (tenant, order number) and per hashed phone, fail-closed: this
// check is an oracle, and when the limiter cannot answer the database behind
// it cannot either.
// =====================================================================

const lookupRowsSchema = z.array(z.object({ order_number: z.string() }));

const WINDOW_SECONDS = 600;
/** Loose per IP: Iraqi carriers put many shoppers behind one CGNAT address. */
const LIMIT_PER_IP = 30;
const LIMIT_PER_ORDER = 10;
const LIMIT_PER_PHONE = 10;

export interface LoyaltyProofInput {
  tenantId: string;
  /** Already normalised (07XXXXXXXXX). */
  phone: string;
  /** Trimmed, non-empty. */
  orderNumber: string;
  /** The caller's address (lib/rate-limit clientIp); "unknown" off the edge. */
  ip: string;
}

export type LoyaltyProof =
  | { kind: "owned" }
  /** No order of that number with that phone in that store. */
  | { kind: "not_owned" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  /** lookup_order itself failed: no answer either way. */
  | { kind: "unavailable" };

/** Seconds to wait when any bucket is exhausted (or the limiter is down), else null. */
async function rateLimited(input: LoyaltyProofInput): Promise<number | null> {
  const mode = "fail-closed";
  const checks = await Promise.all([
    // "unknown" is off the edge (local dev); one shared bucket would throttle every such caller together.
    input.ip !== "unknown" ? consumeRateLimit(`loyalty:ip:${input.ip}`, LIMIT_PER_IP, WINDOW_SECONDS, mode) : null,
    consumeRateLimit(`loyalty:order:${input.tenantId}:${input.orderNumber}`, LIMIT_PER_ORDER, WINDOW_SECONDS, mode),
    consumeRateLimit(`loyalty:phone:${phoneBucket(input.tenantId, input.phone)}`, LIMIT_PER_PHONE, WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

/** Rate-limited check that `phone` placed order `orderNumber` in `tenantId`. */
export async function verifyLoyaltyProof(input: LoyaltyProofInput): Promise<LoyaltyProof> {
  const wait = await rateLimited(input);
  if (wait !== null) return { kind: "rate_limited", retryAfterSeconds: wait };

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("lookup_order", {
    p_tenant_id: input.tenantId,
    p_phone: input.phone,
    p_order_number: input.orderNumber,
  });
  if (error) {
    console.error("[loyalty-proof] ownership check failed:", error.message);
    return { kind: "unavailable" };
  }
  const rows = lookupRowsSchema.safeParse(data);
  return rows.success && rows.data.length > 0 ? { kind: "owned" } : { kind: "not_owned" };
}
