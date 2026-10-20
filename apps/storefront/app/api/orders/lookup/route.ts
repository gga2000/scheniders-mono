import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit, phoneBucket, type RateLimitResult } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Bounded so a limiter key, and the RPC input, stay small.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  order_number: z.string().trim().min(1).max(40),
  phone: z.string().min(1).max(40),
});

const lookupRowSchema = z.object({
  order_number: z.string(),
  /** Coarse bucket (placed/confirmed/shipped/delivered) — kept for older clients. */
  status: z.string(),
  customer_name: z.string().nullable(),
  governorate: z.string().nullable(),
  /** Customer-facing stage (ten values). Optional so the row still validates
   *  against the RPC as deployed before migration 20260909220811. */
  stage: z.string().nullish(),
  /** First ordered product's slug, for a "rate your order" link. */
  review_product_slug: z.string().nullish(),
});

// lookup_order is EXECUTE-granted to service_role only (migration
// 20261021090300). With the anon key anyone could call it straight against
// PostgREST, around the limiter below, and walk a known phone's sequential
// order numbers (or a known order's phones) without bound. This route and
// /api/loyalty/balance are therefore its only callers, each rate-limited.
// The service role reads nothing else here: the function is the whole query.

/** Lookup windows. A shopper checks an order a handful of times; these
 *  only bite on guessing. The per-IP cap is loose because Iraqi mobile
 *  carriers put many shoppers behind one CGNAT address. */
const LOOKUP_WINDOW_SECONDS = 600;
const LOOKUP_LIMIT_PER_IP = 60;
const LOOKUP_LIMIT_PER_ORDER = 10;
const LOOKUP_LIMIT_PER_PHONE = 10;

/**
 * The lookup answers "does this phone own this order" and, on a yes,
 * returns the customer's name. Order numbers are sequential, so without a
 * cap a caller who knows one number could walk the order space, or brute
 * force the phone for a known order. Three buckets, each in its own key:
 *   - per IP: bulk scanning from one address
 *   - per (tenant, order number): phone guessing against one order from
 *     many addresses
 *   - per (tenant, phone): order-number walking for one known phone. The
 *     phone is hashed so the limiter table never holds a raw number.
 * Returns seconds to wait when any bucket is exhausted, else null.
 */
async function lookupRateLimited(
  request: Request,
  tenantId: string,
  orderNumber: string,
  phone: string,
): Promise<number | null> {
  const phoneKey = phoneBucket(tenantId, phone);
  // "unknown" only happens off the edge (local dev); one shared bucket for
  // every such caller would throttle them together, so it is skipped.
  const ip = clientIp(request.headers);
  // Fail-open: ownership is still proven inside lookup_order (order number
  // AND phone must match), so a limiter outage must not take tracking down
  // for every shopper.
  const mode = "fail-open";
  const checks = await Promise.all([
    ip !== "unknown" ? consumeRateLimit(`track:ip:${ip}`, LOOKUP_LIMIT_PER_IP, LOOKUP_WINDOW_SECONDS, mode) : null,
    consumeRateLimit(`track:order:${tenantId}:${orderNumber}`, LOOKUP_LIMIT_PER_ORDER, LOOKUP_WINDOW_SECONDS, mode),
    consumeRateLimit(`track:phone:${phoneKey}`, LOOKUP_LIMIT_PER_PHONE, LOOKUP_WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

// POST, not GET: the request carries a customer's phone number, and a query
// string is written to edge access logs and leaks via Referer. The body is not.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const parsed = querySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { tenant_id, order_number, phone } = parsed.data;

    const limited = await lookupRateLimited(request, tenant_id, order_number, phone);
    if (limited !== null) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limited) } },
      );
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("lookup_order", {
      p_tenant_id: tenant_id,
      p_phone: phone,
      p_order_number: order_number,
    });

    if (error) {
      console.error("[api/orders/lookup]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    const rows = z.array(lookupRowSchema).safeParse(data);
    if (!rows.success || rows.data.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = rows.data[0];
    return NextResponse.json({
      order_number: row.order_number,
      status: row.status,
      customer_name: row.customer_name ?? undefined,
      governorate: row.governorate ?? undefined,
      stage: row.stage ?? undefined,
      review_product_slug: row.review_product_slug ?? undefined,
    });
  } catch (e) {
    console.error("[api/orders/lookup]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
