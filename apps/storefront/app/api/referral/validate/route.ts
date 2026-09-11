import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile, normalizeReferralCode, resolveReferral } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Preview for the order forms: is this code usable by this buyer, and what
// does the friend get? Runs the SAME referral_check the checkout runs, so a
// code never previews as valid and then fails at submit. Returns only the
// program's public terms — never the referrer's identity.
//
// Why a phone never gets a specific reason back.
//
// A referral code is meant to be shared, so anyone can hold one. This endpoint
// is unauthenticated and takes a phone number nobody has proved they own. It
// used to answer "not_first_order" or "self" for that number, which made it an
// oracle over a third party's relationship with the store: feed it numbers and
// learn who has ordered here, and which number owns a given code. Iraqi mobile
// numbers are a small, enumerable space, so that is a practical attack rather
// than a theoretical one.
//
// A code's own status ("off", "unknown") says nothing about a person and is
// still reported. The moment the answer would be about the *holder* of a phone
// number, it collapses to a single "ineligible" — which is the part the real
// shopper needs anyway: the code will not work on this order. Combined with a
// per-caller window, enumeration buys nothing.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  code: z.string().min(1).max(32),
  phone: z.string().optional(),
});

export type ReferralValidation =
  | { valid: true; friend_discount_pct: number; friend_max_discount_iqd: number | null }
  | { valid: false; reason: "off" | "unknown" | "ineligible" };

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

  // Bounds how fast a caller can probe, whatever they are probing for.
  const limit = await consumeRateLimit(
    `referral-validate:${parsed.data.tenant_id}:${code}`,
    30,
    60,
  );
  if (!limit.allowed) return invalid("unknown");

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
    // `self` and `not_first_order` are both facts about the person holding
    // that number. Neither is reported; see the note at the top.
    const reason = row.reason;
    return invalid(
      reason === "self" || reason === "not_first_order" ? "ineligible" : "unknown",
    );
  }
  return NextResponse.json({
    valid: true,
    friend_discount_pct: program.friendDiscountPct,
    friend_max_discount_iqd: program.friendMaxDiscountIqd,
  } satisfies ReferralValidation);
}
