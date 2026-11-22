import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import { adminDisplayName } from "@/lib/support-admin-name";
import { NeedsUsSchema, StartConversationSchema, SupportRequestIdSchema, supportRefusal, wasRepeat } from "@/lib/support";

const StartRequestSchema = StartConversationSchema.extend(SupportRequestIdSchema.shape);

export const dynamic = "force-dynamic";

/**
 * GET /api/support/needs-us — every real shop with something wrong right now
 * (store paused, wallet empty, orders stopped...), counted in the database by
 * support_shops_needing_us(). The demo store, prospects and closed shops never show.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await createAdminClient().rpc("support_shops_needing_us");
    if (error) throw error;
    return NextResponse.json({ shops: NeedsUsSchema.parse(data) });
  } catch (error) {
    console.error("Support needs-us API error:", error);
    return NextResponse.json({ error: "Failed to load the shops that need us" }, { status: 500 });
  }
}

/**
 * POST /api/support/needs-us {tenantId, body} — write first. Opens a
 * conversation with the shop's owner (or writes in their open one); the
 * merchant gets the same ping as any reply.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = StartRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("support_staff_start", {
      p_tenant_id: parsed.data.tenantId,
      p_admin_id: admin.user.id,
      p_admin_name: await adminDisplayName(supabase, admin),
      p_body: parsed.data.body,
      p_request_id: parsed.data.request_id,
    });

    const refusal = supportRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    const result = data as { case_id: string; started: boolean };
    // A repeat of the same send did nothing new, and was logged the first time.
    if (wasRepeat(data)) return NextResponse.json({ caseId: result.case_id, started: result.started });
    await logAdminActivity({
      adminUserId: admin.user.id,
      actorEmail: admin.user.email,
      tenantId: parsed.data.tenantId,
      action: "support_reached_out",
      details: { case_id: result.case_id, started: result.started },
    });
    return NextResponse.json({ caseId: result.case_id, started: result.started });
  } catch (error) {
    console.error("Support write-first error:", error);
    return NextResponse.json({ error: "Failed to send the message" }, { status: 500 });
  }
}
