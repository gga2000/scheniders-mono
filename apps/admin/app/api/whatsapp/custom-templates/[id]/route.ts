import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { notAnId } from "@/lib/route-id";
import { customWaItemSchema, customWaStepSchema } from "@/lib/custom-whatsapp-queue";

const answerSchema = customWaItemSchema.omit({ tenant: true });

/**
 * POST /api/whatsapp/custom-templates/:id — staff move a shop's paid custom
 * WhatsApp message along (admin_custom_whatsapp_template_step):
 *   { step: "at_meta" }                 submitted in Interakt, waiting on Meta
 *   { step: "live", category }          Meta approved it, under that category;
 *                                       the shop's sends use it from now on
 *   { step: "rejected", reason }        Meta refused it: the shop is refunded
 *   { step: "declined", reason }        we will not submit it: refunded too
 * The reason is shown to the shop as written. A step the request is no longer
 * at (a double click, a colleague got there first) is answered 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "review_whatsapp_templates");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  const parsed = customWaStepSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Send { step: "at_meta" }, { step: "live", category }, or { step: "rejected" | "declined", reason }' },
      { status: 400 },
    );
  }
  const step = parsed.data;

  try {
    const { data, error } = await createAdminClient().rpc("admin_custom_whatsapp_template_step", {
      p_id: id,
      p_step: step.step,
      p_admin_id: auth.user.id,
      p_category: step.step === "live" ? step.category : undefined,
      p_reason: step.step === "rejected" || step.step === "declined" ? step.reason : undefined,
    });
    if (error) {
      if (error.code === "P0002") return NextResponse.json({ error: "Request not found" }, { status: 404 });
      // The request is no longer at the step this one follows.
      if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }
    const row = answerSchema.parse(data);

    await logAdminAction(auth, "custom_wa_step", {
      tenantId: row.tenant_id,
      details: {
        request_id: id,
        template_name: row.template_name,
        purpose: row.purpose,
        step: step.step,
        category: row.category,
        reason: row.reason,
        refunded_iqd: row.refunded_at ? row.price_iqd : null,
      },
    });

    return NextResponse.json(row);
  } catch (error) {
    console.error("Custom WhatsApp message step error:", error);
    return NextResponse.json({ error: "Failed to move the custom WhatsApp message" }, { status: 500 });
  }
}
