import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import {
  IRAQ_GOVERNORATES,
  assignAbArm,
  type GovernorateCode,
  type Experiment,
} from "@scheniders/shared";
import { submitCheckout } from "@/app/actions/checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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

    const payload = {
      tenantId: data.tenant_id,
      idempotencyKey: data.idempotency_key,
      couponCode: data.coupon_code,
      purchaseEventId: data.event_id,
      redeemPoints: data.redeem_points,
      customer: {
        customer_name: data.customer_name,
        phone: data.phone,
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

    if (result.success) {
      try {
        const visitorKey = (await cookies()).get("sb_vid")?.value;
        if (visitorKey) {
          const svc = createSupabaseServiceClient();
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
        console.error("[checkout/orders] experiment event write threw:", e);
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
    return NextResponse.json(result, { status: 422 });
  } catch (e) {
    console.error("[api/checkout/orders]", e);
    return NextResponse.json(
      { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
