import { NextResponse } from "next/server";
import { z } from "zod";
import { findActiveDiscount, type DiscountCode } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Check one typed coupon code. The store's coupon list is no longer sent to
// the browser (redactServerOnlyConfig): anyone could read every private code
// from the page source. The shopper's cart asks here instead and gets back
// only the definition of the code they typed, so the cart can preview the
// saving. Checkout still re-prices from the database, never from this answer.
//
// Guessing codes is bounded per caller address; the answer for a wrong code is
// the same whether the code never existed or has expired.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  code: z.string().trim().min(1).max(64),
});

/** A shopper types one or two codes; a guesser types hundreds. */
const VALIDATE_PER_CALLER_PER_10_MIN = 15;

export type CouponValidation =
  | { valid: true; discount: DiscountCode }
  | { valid: false };

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id"),
    code: url.searchParams.get("code"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { tenant_id: tenantId, code } = parsed.data;

  const byCaller = await consumeRateLimit(
    `coupon-validate:ip:${tenantId}:${clientIp(req.headers)}`,
    VALIDATE_PER_CALLER_PER_10_MIN,
    600,
    "fail-closed",
  );
  if (!byCaller.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const svc = createSupabaseServiceClient();
  const { data: tenant, error } = await svc
    .from("tenants")
    .select("store_config_v2")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[coupon/validate] tenant read failed:", error.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  const discounts = (
    tenant?.store_config_v2 as { commerce?: { discounts?: DiscountCode[] } } | null
  )?.commerce?.discounts;
  const match = findActiveDiscount(code, discounts);
  if (!match) return NextResponse.json({ valid: false } satisfies CouponValidation);
  return NextResponse.json({ valid: true, discount: match } satisfies CouponValidation);
}
