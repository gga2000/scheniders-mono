import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/rate-limit";
import { verifyLoyaltyProof } from "@/lib/loyalty-proof";

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
// Proof is an order number of THIS store placed with THIS phone, checked
// rate-limited and fail-closed by lib/loyalty-proof — the same check
// submitCheckout runs before it spends points.
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

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const proof = await verifyLoyaltyProof({ tenantId, phone, orderNumber, ip: clientIp(req.headers) });
  switch (proof.kind) {
    case "rate_limited":
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(proof.retryAfterSeconds) } },
      );
    case "unavailable":
      return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
    case "not_owned":
      return notFound();
    case "owned":
      break;
  }

  const service = createSupabaseServiceClient();
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
