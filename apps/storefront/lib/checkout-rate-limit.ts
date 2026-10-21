// =====================================================================
// Rate limit for placing storefront orders (F-041)
// =====================================================================
// Every checkout is a real COD order the merchant has to call and ship, and
// it runs create_order_atomic. Two buckets, each in its own key of the shared
// Postgres limiter (lib/rate-limit):
//   - per IP: one machine scripting fake orders into any store. Iraqi mobile
//     carriers put many shoppers behind one CGNAT address, so the cap is
//     loose: 20 orders / 10 min from one address is far above what a real
//     crowd behind one address places (the whole platform takes ~20 orders a
//     day today), while still capping a script at 2 orders/min.
//   - per (tenant, phone): fake orders in one shopper's name. A real shopper
//     places one order, maybe a second to fix a mistake; 5 / hour leaves room
//     for that. The phone is hashed so the limiter never stores the number.
// An idempotent replay (same key, lost response) is answered before this
// runs, so retries on a flaky connection never count.
//
// Fail-open: when the limiter itself cannot answer, the order is still
// placed and the outage is logged. Refusing would stop every store's sales
// over a limiter fault, while the order path keeps its own database guards.
// =====================================================================

import { createHash } from "node:crypto";
import { clientIp, consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";

export const CHECKOUT_WINDOW_SECONDS_PER_IP = 600;
export const CHECKOUT_LIMIT_PER_IP = 20;
export const CHECKOUT_WINDOW_SECONDS_PER_PHONE = 3600;
export const CHECKOUT_LIMIT_PER_PHONE = 5;

/** Seconds to wait when a bucket is exhausted, else null. */
export async function checkoutRateLimited(
  headers: Headers,
  tenantId: string,
  phone: string,
): Promise<number | null> {
  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  const phoneKey = createHash("sha256").update(`${tenantId}:${phoneDigits}`).digest("hex").slice(0, 32);
  // "unknown" only happens off the edge (local dev); one shared bucket for
  // every such caller would throttle them together, so it is skipped.
  const ip = clientIp(headers);
  const checks = await Promise.all([
    ip !== "unknown"
      ? consumeRateLimit(`checkout:ip:${ip}`, CHECKOUT_LIMIT_PER_IP, CHECKOUT_WINDOW_SECONDS_PER_IP, "fail-open")
      : null,
    consumeRateLimit(`checkout:phone:${phoneKey}`, CHECKOUT_LIMIT_PER_PHONE, CHECKOUT_WINDOW_SECONDS_PER_PHONE, "fail-open"),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}
