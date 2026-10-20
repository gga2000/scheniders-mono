import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { upsellProofSecret, verifyUpsellProof } from "@/lib/order-upsell-proof";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mint (or return) the buyer's referral code. A code is worth points, so it
// goes only to someone who just placed an order — proven the way the
// post-purchase upsell proves it: the `x-upsell-proof` the checkout signed in
// the response that created the order, held only by the browser that placed
// it (lib/order-upsell-proof). An order id alone proves nothing (it travels to
// the merchant's tools, webhooks and the courier), and a typed phone number
// proves nothing at all.
//
// The tenant comes FROM the proof, never the request, and the phone the code
// is minted for is the ORDER's, read here — the caller cannot name either.
const PROOF_HEADER = "x-upsell-proof";
const bodySchema = z.object({ order_id: z.string().uuid() });

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const { order_id } = parsed.data;

  // Every failure is the same 404: distinguishing "bad proof" from "no such
  // order" would let someone probe order ids.
  const secret = upsellProofSecret();
  if (!secret) return notFound();
  const proof = verifyUpsellProof(req.headers.get(PROOF_HEADER), secret);
  if (!proof || proof.orderId !== order_id) return notFound();
  const tenantId = proof.tenantId;

  const svc = createSupabaseServiceClient();
  const { data: tenant, error: tenantErr } = await svc
    .from("tenants")
    .select("store_config_v2")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantErr) {
    console.error("[referral/code] tenant read failed:", tenantErr.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  const commerce = (tenant?.store_config_v2 as { commerce?: { referral?: { enabled?: boolean } } } | null)?.commerce;
  // The program is opt-in: no code exists for a store that never turned it on.
  if (commerce?.referral?.enabled !== true) return notFound();

  const { data: order, error: orderErr } = await svc
    .from("orders")
    .select("id, phone, deleted_at")
    .eq("id", order_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (orderErr) {
    console.error("[referral/code] order read failed:", orderErr.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  if (!order || order.deleted_at || !order.phone) return notFound();

  const { data: code, error } = await svc.rpc("mint_referral_code", {
    _tenant_id: tenantId,
    _phone: order.phone,
  });
  if (error) {
    console.error("[referral/code] mint failed:", error.message);
    return NextResponse.json({ error: "Mint failed" }, { status: 500 });
  }
  // NULL: the order's phone is not an Iraqi mobile, so it has no balance key.
  if (typeof code !== "string") return notFound();
  return NextResponse.json({ code });
}
