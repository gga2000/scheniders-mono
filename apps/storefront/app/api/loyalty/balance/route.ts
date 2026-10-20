import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit, phoneBucket, type RateLimitResult } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Loyalty balance — only to someone who shows they are that customer
// =====================================================================
// The balance is read with the service role (customer_points is member-RLS),
// so this route is the whole access check. It used to answer a GET with any
// tenant + phone: anyone could walk phone numbers and learn who buys from a
// store and roughly how much (points track spend).
//
// Proof is the one a returning shopper can give at checkout and a stranger
// cannot: an order number of THIS store placed with THIS phone, checked by
// lookup_order (the same match order tracking uses). Order numbers are
// sequential, so the pair is guessable only by brute force, which the
// limiter stops: per IP, per (tenant, order number) and per hashed phone,
// fail-closed — this route is an oracle, and when the limiter cannot answer
// the database behind it cannot either.
//
// POST, not GET: the body carries a phone number, which a query string would
// write into edge access logs and Referer headers. Every "not yours" answer is
// the same 404, so the route says no more about a phone than tracking does.
// =====================================================================

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  phone: z.string().min(1).max(40),
  order_number: z.string().trim().min(1).max(40),
});

const lookupRowsSchema = z.array(z.object({ order_number: z.string() }));

const WINDOW_SECONDS = 600;
/** Loose per IP: Iraqi carriers put many shoppers behind one CGNAT address. */
const LIMIT_PER_IP = 30;
const LIMIT_PER_ORDER = 10;
const LIMIT_PER_PHONE = 10;

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Seconds to wait when any bucket is exhausted (or the limiter is down), else null. */
async function rateLimited(req: Request, tenantId: string, orderNumber: string, phone: string): Promise<number | null> {
  const ip = clientIp(req.headers);
  const mode = "fail-closed";
  const checks = await Promise.all([
    // "unknown" is off the edge (local dev); one shared bucket would throttle every such caller together.
    ip !== "unknown" ? consumeRateLimit(`loyalty:ip:${ip}`, LIMIT_PER_IP, WINDOW_SECONDS, mode) : null,
    consumeRateLimit(`loyalty:order:${tenantId}:${orderNumber}`, LIMIT_PER_ORDER, WINDOW_SECONDS, mode),
    consumeRateLimit(`loyalty:phone:${phoneBucket(tenantId, phone)}`, LIMIT_PER_PHONE, WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { tenant_id: tenantId, order_number: orderNumber } = parsed.data;
  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  }

  const wait = await rateLimited(req, tenantId, orderNumber, phone);
  if (wait !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  const service = createSupabaseServiceClient();
  const { data: owned, error: lookupError } = await service.rpc("lookup_order", {
    p_tenant_id: tenantId,
    p_phone: phone,
    p_order_number: orderNumber,
  });
  if (lookupError) {
    console.error("[loyalty/balance] ownership check failed:", lookupError.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  const rows = lookupRowsSchema.safeParse(owned);
  if (!rows.success || rows.data.length === 0) return notFound();

  const { data, error } = await service
    .from("customer_points")
    .select("balance")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("[loyalty/balance] balance read failed:", error.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  return NextResponse.json({ balance: data?.balance ?? 0 });
}
