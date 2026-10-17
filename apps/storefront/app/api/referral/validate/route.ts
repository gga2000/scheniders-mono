import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile, normalizeReferralCode, resolveReferral } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

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
// is unauthenticated and takes a phone number nobody has proved they own. An
// answer of "not_first_order" or "self" for that number would make it an
// oracle over a third party's relationship with the store: feed it numbers and
// learn who has ordered here, and which number owns a given code. Iraqi mobile
// numbers are a small, enumerable space, so that is a practical attack rather
// than a theoretical one.
//
// A code's own status ("off", "unknown") says nothing about a person and is
// still reported. The moment the answer would be about the *holder* of a phone
// number, it collapses to a single "ineligible" — which is the part the real
// shopper needs anyway: the code will not work on this order.
//
// Two windows bound probing: one per caller address (guessing codes — each
// guess is a different code) and one per code (testing many phones against
// one code). Both are checked before anything is looked up.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  code: z.string().min(1).max(32),
  phone: z.string().optional(),
});

/** Per caller address, per minute — a shopper types one or two codes. */
const VALIDATE_PER_CALLER_PER_MIN = 20;
/** Per code, per minute — the form re-checks as the phone is typed. */
const VALIDATE_PER_CODE_PER_MIN = 30;

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
  const invalid = (reason: Extract<ReferralValidation, { valid: false }>["reason"]) =>
    NextResponse.json({ valid: false, reason } satisfies ReferralValidation);

  const tenantId = parsed.data.tenant_id;
  const byCaller = await consumeRateLimit(
    `referral-validate:ip:${tenantId}:${clientIp(req.headers)}`,
    VALIDATE_PER_CALLER_PER_MIN,
    60,
  );
  if (!byCaller.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const code = normalizeReferralCode(parsed.data.code);
  if (!code) return invalid("unknown");

  const byCode = await consumeRateLimit(
    `referral-validate:code:${tenantId}:${code}`,
    VALIDATE_PER_CODE_PER_MIN,
    60,
  );
  if (!byCode.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const svc = createSupabaseServiceClient();
  const { data: tenant, error: tenantErr } = await svc
    .from("tenants")
    .select("store_config_v2")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantErr) {
    console.error("[referral/validate] tenant read failed:", tenantErr.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  const commerce = (
    tenant?.store_config_v2 as {
      commerce?: { referral?: Parameters<typeof resolveReferral>[0]; loyalty?: Parameters<typeof resolveReferral>[1] };
    } | null
  )?.commerce;
  const program = resolveReferral(commerce?.referral, commerce?.loyalty);
  if (!program.enabled) return invalid("off");

  const phone = parsed.data.phone ? normalizeIraqiMobile(parsed.data.phone) : null;
  const { data, error } = await svc.rpc("referral_check", {
    _tenant_id: tenantId,
    _code: code,
    // The SQL treats an empty string like NULL: only the code is checked.
    _phone: phone ?? "",
  });
  if (error) {
    console.error("[referral/validate] referral_check failed:", error.message);
    return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return invalid("unknown");
  if (!row.ok) {
    // `self` and `not_first_order` are both facts about the person holding
    // that number. Neither is reported; see the note at the top.
    return invalid(row.reason === "self" || row.reason === "not_first_order" ? "ineligible" : "unknown");
  }
  return NextResponse.json({
    valid: true,
    friend_discount_pct: program.friendDiscountPct,
    friend_max_discount_iqd: program.friendMaxDiscountIqd,
  } satisfies ReferralValidation);
}
