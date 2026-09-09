import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile, normalizeReferralCode, resolveReferral } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Preview for the order forms: is this code usable by this buyer, and what
// does the friend get? Runs the SAME referral_check the checkout runs, so a
// code never previews as valid and then fails at submit. Returns only the
// program's public terms — never the referrer's identity.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  code: z.string().min(1).max(32),
  phone: z.string().optional(),
});

export type ReferralValidation =
  | { valid: true; friend_discount_pct: number; friend_max_discount_iqd: number | null }
  | { valid: false; reason: "off" | "unknown" | "self" | "not_first_order" };

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id"),
    code: url.searchParams.get("code"),
    phone: url.searchParams.get("phone") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const code = normalizeReferralCode(parsed.data.code);
  const invalid = (reason: Extract<ReferralValidation, { valid: false }>["reason"]) =>
    NextResponse.json({ valid: false, reason } satisfies ReferralValidation);
  if (!code) return invalid("unknown");

  const svc = createSupabaseServiceClient();
  const { data: tenant } = await svc
    .from("tenants")
    .select("store_config_v2")
    .eq("id", parsed.data.tenant_id)
    .maybeSingle();
  const commerce = (
    tenant?.store_config_v2 as {
      commerce?: { referral?: Parameters<typeof resolveReferral>[0]; loyalty?: Parameters<typeof resolveReferral>[1] };
    } | null
  )?.commerce;
  const program = resolveReferral(commerce?.referral, commerce?.loyalty);
  if (!program.enabled) return invalid("off");

  const phone = parsed.data.phone ? normalizeIraqiMobile(parsed.data.phone) : null;
  const { data, error } = await svc.rpc("referral_check", {
    _tenant_id: parsed.data.tenant_id,
    _code: code,
    // The SQL treats an empty string like NULL: only the code is checked.
    _phone: phone ?? "",
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return invalid("unknown");
  if (!row.ok) {
    const reason = row.reason;
    return invalid(reason === "self" || reason === "not_first_order" ? reason : "unknown");
  }
  return NextResponse.json({
    valid: true,
    friend_discount_pct: program.friendDiscountPct,
    friend_max_discount_iqd: program.friendMaxDiscountIqd,
  } satisfies ReferralValidation);
}
