import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import {
  IRAQ_GOVERNORATES,
  assignAbArm,
  normalizeIraqiMobile,
  type GovernorateCode,
  type Experiment,
} from "@scheniders/shared";
import { submitCheckout } from "@/app/actions/checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isDraftViewRequest } from "@/lib/draft-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only canonical OMS governorate codes (BG/BA/…) are accepted — never the
// human-readable name. Guards the order pipeline against malformed input.
const GOVERNORATE_CODES = IRAQ_GOVERNORATES.map((g) => g.code) as [
  GovernorateCode,
  ...GovernorateCode[],
];

export const checkoutOrderBodySchema = z.object({
  tenant_id: z.string().uuid(),
  customer_name: z.string().min(1),
  phone: z.string().min(1),
  governorate_code: z.enum(GOVERNORATE_CODES),
  city: z.string().min(1),
  address_details: z.string().min(1),
  /** Optional second number the courier tries when `phone` doesn't answer
   *  (the PDP buy box's "رقم بديل"). Normalised to 07XXXXXXXXX below and
   *  stored on `orders.secondary_phone` — never smuggled into `notes`. */
  alt_phone: z.string().trim().max(32).optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  payment_method: z.enum(["cod", "card", "fastpay"]).optional().default("cod"),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().nullable().default(null),
        name: z.string(),
        variant_name: z.string().nullable().default(null),
        price: z.number(),
        quantity: z.int().min(1),
      }),
    )
    .min(1),
  // EC17: client-generated key to dedupe a re-submitted order (flaky-3G retry).
  // Length-bounded string (UUID or fallback token) — forwarded to the pipeline.
  idempotency_key: z.string().min(8).max(100).optional(),
  /** Discount engine: coupon code (validated + priced server-side). */
  coupon_code: z.string().min(1).max(64).optional(),
  /** Pixel Purchase event_id — reused by the CAPI server twin for dedup. */
  event_id: z.string().min(8).max(100).optional(),
  /** Loyalty: points the customer chose to redeem (server re-validates). */
  redeem_points: z.number().int().min(0).optional(),
  /** Loyalty: a previous order number of this phone — the proof a redemption needs. */
  loyalty_order_number: z.string().trim().min(1).max(40).optional(),
  /** Referral: a friend's code (server re-checks eligibility + prices it). */
  referral_code: z.string().min(1).max(32).optional(),
  // accepted and dropped — not forwarded to the order pipeline
  subtotal: z.number().optional(),
  locale: z.string().optional(),
  ab_test_arms: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }

    const parsed = checkoutOrderBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Same rule as the primary phone (EC23): a COD alt number is only useful
    // if the courier can actually dial it. The client validates on blur, so
    // this only trips for a bypassed/old client — reject rather than store
    // an undialable string.
    const altPhone = data.alt_phone ? normalizeIraqiMobile(data.alt_phone) : null;
    if (data.alt_phone && !altPhone) {
      return NextResponse.json(
        { success: false, error: "الرقم البديل غير صالح" },
        { status: 422 },
      );
    }

    const payload = {
      tenantId: data.tenant_id,
      idempotencyKey: data.idempotency_key,
      couponCode: data.coupon_code,
      purchaseEventId: data.event_id,
      redeemPoints: data.redeem_points,
      loyaltyOrderNumber: data.loyalty_order_number,
      referralCode: data.referral_code,
      customer: {
        customer_name: data.customer_name,
        phone: data.phone,
        alt_phone: altPhone,
        governorate_code: data.governorate_code,
        city: data.city,
        address_details: data.address_details,
        notes: data.notes,
      },
      items: data.items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        name: i.name,
        variant_name: i.variant_name,
        price: i.price,
        quantity: i.quantity,
      })),
    };

    const result = await submitCheckout(payload);

    // A replayed submit — the same idempotency key (EC17) or the soft
    // duplicate guard — answers an order whose purchase and experiment rows
    // were written when it was placed; writing them again would count one
    // order twice.
    if (result.success && !result.replayed) {
      try {
        const visitorKey = (await cookies()).get("sb_vid")?.value;
        // A test order placed from draft view is the merchant, not a
        // converted shopper — keep it out of the experiment's revenue.
        if (visitorKey && !(await isDraftViewRequest(data.tenant_id))) {
          const svc = createSupabaseServiceClient();
          // First-party funnel: one purchase row per line product so the
          // merchant's "viewed → bought" per product is exact; the value is
          // the server-computed total on the first row only (revenue sums).
          const { error: funnelErr } = await svc.from("storefront_events").insert(
            payload.items.map((i, idx) => ({
              tenant_id: parsed.data.tenant_id,
              visitor_key: visitorKey,
              event_type: "purchase" as const,
              page_id: "checkout",
              product_id: i.product_id,
              order_id: result.orderId ?? null,
              value_iqd: idx === 0 ? Math.round(result.total ?? 0) : null,
            })),
          );
          if (funnelErr) console.error("[checkout/orders] funnel purchase write failed:", funnelErr);
          // EC19: re-derive the visitor's arm per running experiment from the
          // store config — never trust the client's `ab_test_arms` (which could
          // forge revenue attribution to a chosen arm). Revenue is the
          // server-computed total, not a client value.
          const { data: tenantRow } = await svc
            .from("tenants")
            .select("store_config_v2")
            .eq("id", parsed.data.tenant_id)
            .single();
          const experiments =
            ((tenantRow?.store_config_v2 as { experiments?: Experiment[] } | null)
              ?.experiments) ?? [];
          const rows = experiments
            .map((exp) => ({ exp, arm: assignAbArm(exp, visitorKey) }))
            .filter((x): x is { exp: Experiment; arm: string } => x.arm !== null)
            .map(({ exp, arm }) => ({
              tenant_id: parsed.data.tenant_id,
              experiment_id: exp.id,
              arm_id: arm,
              visitor_key: visitorKey,
              event_type: "order" as const,
              revenue_iqd: result.total ?? null,
            }));
          if (rows.length > 0) {
            const { error: evErr } = await svc
              .from("store_config_experiment_events")
              .insert(rows);
            if (evErr)
              console.error(
                "[checkout/orders] experiment event write failed:",
                evErr,
              );
          }
        }
      } catch (e) {
        console.error("[checkout/orders] funnel/experiment event write threw:", e);
      }
    }

    if (result.success) {
      // Mark this browser as having placed an order — used by audience-segment
      // evaluation (has_ordered_before rule) on subsequent storefront renders.
      const res = NextResponse.json(result, { status: 200 });
      res.cookies.set("sb_ordered", "1", {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
      res.cookies.set("sb_gov", parsed.data.governorate_code, {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
      return res;
    }
    // A platform failure (the database did not answer) is not the order's
    // fault: 503 tells the client the same request — same idempotency key —
    // may be sent again. Everything else, including line `issues` and the
    // `new_price` self-heal, is the 422 the shopper acts on.
    return NextResponse.json(result, { status: result.retryable ? 503 : 422 });
  } catch (e) {
    console.error("[api/checkout/orders]", e);
    return NextResponse.json(
      { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
