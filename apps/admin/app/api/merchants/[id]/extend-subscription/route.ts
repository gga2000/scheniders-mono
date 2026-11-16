import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { z } from "zod";

const bodySchema = z.object({
  days: z.number().int().positive().max(365),
});

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    tenant_id: z.string(),
    current_period_end: z.string(),
    status: z.string(),
  }),
  z.object({ success: z.literal(false), error: z.string(), status: z.string().optional() }),
]);

/** The database's refusals, as HTTP answers staff can act on. */
const REFUSALS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Merchant not found" },
  no_subscription: { status: 404, error: "No subscription found for this merchant" },
  demo_store: { status: 409, error: "The demo store has no paid time to extend" },
  paused: { status: 409, error: "This shop is paused. Lift the pause first" },
  still_trial: { status: 409, error: "This shop is on trial. Extend the trial or convert it instead" },
  not_active: { status: 409, error: "This shop is not active. Reactivate it first" },
};

/**
 * POST /api/merchants/:id/extend-subscription — add paid days with no
 * payment. Super admins only (`manage_subscription`).
 *
 * admin_extend_subscription does it in one step: only an active shop, its
 * status kept (a paused, suspended, cancelled or trial shop, or the demo
 * store, is refused), and the staff log row written with the old and new
 * period end.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "manage_subscription");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const { data, error } = await createAdminClient().rpc("admin_extend_subscription", {
      _tenant_id: id,
      _days: parsed.data.days,
      _admin_user_id: auth.user.id,
      _actor_email: auth.user.email ?? null,
    });
    if (error) throw error;

    const result = resultSchema.parse(data);
    if (!result.success) {
      const refusal = REFUSALS[result.error];
      if (!refusal) throw new Error(`Unexpected admin_extend_subscription refusal: ${result.error}`);
      return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    }
    return NextResponse.json({
      tenant_id: result.tenant_id,
      current_period_end: result.current_period_end,
      status: result.status,
    });
  } catch (error) {
    console.error("Extend subscription error:", error);
    return NextResponse.json(
      { error: "Failed to extend subscription" },
      { status: 500 }
    );
  }
}
