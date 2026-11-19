import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { adminDisplayName } from "@/lib/support-admin-name";
import { ShopCallLoggedSchema, ShopCallSchema, supportRefusal } from "@/lib/support";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/calls {tenantId, outcome, note} — record a call on a shop
 * that has no task (a trial about to end, a quiet shop). Same call log and
 * activity row as a task call, both written by the database in one
 * transaction; open tasks are left as they are.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = ShopCallSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("support_log_shop_call", {
      p_tenant_id: parsed.data.tenantId,
      p_admin_id: admin.user.id,
      p_admin_name: await adminDisplayName(supabase, admin),
      p_outcome: parsed.data.outcome,
      p_note: parsed.data.note,
      p_actor_email: admin.user.email ?? null,
    });

    const refusal = supportRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    const call = ShopCallLoggedSchema.parse(data);
    return NextResponse.json({ success: true, call });
  } catch (error) {
    console.error("Support shop call error:", error);
    return NextResponse.json({ error: "Failed to save the call" }, { status: 500 });
  }
}
