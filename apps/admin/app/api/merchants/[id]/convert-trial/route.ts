import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { REQUEST_REUSED, SHOP_PAUSED } from "@/lib/billing-lock-tools";
import { notAnId } from "@/lib/route-id";
import { staffReasonSchema, staffRequestIdSchema } from "@/lib/staff-reason";

const bodySchema = z.object({
  period_days: z.number().int().min(1).max(365),
  reason: staffReasonSchema,
  request_id: staffRequestIdSchema,
});

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    tenant_id: z.string(),
    status: z.string(),
    current_period_end: z.string(),
    repeat: z.boolean().optional(),
  }),
  z.object({ success: z.literal(false), error: z.string(), status: z.string().optional() }),
]);

/** The database's refusals, as HTTP answers staff can act on. */
const REFUSALS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Merchant not found" },
  demo_store: { status: 409, error: "The demo store has no free time to start" },
  prospect_store: { status: 409, error: "This store was built for a lead. Convert the lead instead" },
  paused: SHOP_PAUSED,
  not_trial: { status: 409, error: "This shop is no longer on trial. Reload the page to see it" },
  request_reused: REQUEST_REUSED,
};

/**
 * POST /api/merchants/:id/convert-trial — end a shop's trial and start paid
 * time with no charge, for a shop that paid us some other way. Super admins
 * only (`manage_subscription`).
 *
 * admin_convert_trial does it in one step: only a shop on trial (the demo
 * store, a lead's pre-built store and a paused trial are refused), the shop
 * made active, its one
 * subscription active from now to now + days with renewal on, and the staff
 * log row with the reason, in one transaction. It runs through
 * admin_convert_trial_once, so the same request_id (a retry, a double click)
 * converts once and gets the first answer back with `repeat`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "manage_subscription");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const { data, error } = await createAdminClient().rpc("admin_convert_trial_once", {
      _request_id: parsed.data.request_id,
      _tenant_id: id,
      _days: parsed.data.period_days,
      _reason: parsed.data.reason,
      _admin_user_id: auth.user.id,
      _actor_email: auth.user.email ?? null,
    });
    if (error) throw error;

    const result = resultSchema.parse(data);
    if (!result.success) {
      const refusal = REFUSALS[result.error];
      if (!refusal) throw new Error(`Unexpected admin_convert_trial refusal: ${result.error}`);
      return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      current_period_end: result.current_period_end,
      repeat: result.repeat === true,
    });
  } catch (error) {
    console.error("Convert trial error:", error);
    return NextResponse.json(
      { error: "Failed to convert trial to paid" },
      { status: 500 }
    );
  }
}
