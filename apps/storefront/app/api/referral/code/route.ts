import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mint (or return) the caller's referral code. The thank-you page calls this
// right after an order with the same proof the post-purchase upsell uses:
// the caller must know an order id AND the phone it was placed with. That
// keeps codes for real buyers only — a code is worth points, so nobody
// should be able to mint one by typing a phone number.
const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  order_id: z.string().uuid(),
  phone: z.string().min(7),
});

function lastTen(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { tenant_id, order_id } = parsed.data;
  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const svc = createSupabaseServiceClient();
  const { data: tenant } = await svc
    .from("tenants")
    .select("store_config_v2")
    .eq("id", tenant_id)
    .maybeSingle();
  const commerce = (tenant?.store_config_v2 as { commerce?: { referral?: { enabled?: boolean } } } | null)?.commerce;
  // The program is opt-in: no code exists for a store that never turned it on.
  if (commerce?.referral?.enabled !== true) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Every failure is the same 404: distinguishing "wrong phone" from "no such
  // order" would let someone probe order ids.
  const { data: order } = await svc
    .from("orders")
    .select("id, phone, deleted_at")
    .eq("id", order_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (!order || order.deleted_at || lastTen(order.phone ?? "") !== lastTen(phone)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: code, error } = await svc.rpc("mint_referral_code", {
    _tenant_id: tenant_id,
    _phone: phone,
  });
  if (error || typeof code !== "string") {
    return NextResponse.json({ error: "Mint failed" }, { status: 500 });
  }
  return NextResponse.json({ code });
}
