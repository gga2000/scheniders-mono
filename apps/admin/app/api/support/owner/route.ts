import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import { TakeShopSchema } from "@/lib/support";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/owner {tenantId} — "Take this shop": the caller becomes
 * the shop's named support person, the one its Help chat shows.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = TakeShopSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const shop = await supabase.from("tenants").select("id").eq("id", parsed.data.tenantId).maybeSingle();
    if (shop.error) throw shop.error;
    if (!shop.data) return NextResponse.json({ error: "This shop no longer exists." }, { status: 404 });

    const { error } = await supabase.from("support_shop_owners").upsert(
      {
        tenant_id: parsed.data.tenantId,
        admin_id: admin.user.id,
        assigned_at: new Date().toISOString(),
        assigned_by: admin.user.id,
      },
      { onConflict: "tenant_id" },
    );
    if (error) throw error;

    await logAdminActivity({
      adminUserId: admin.user.id,
      actorEmail: admin.user.email,
      tenantId: parsed.data.tenantId,
      action: "support_shop_taken",
      details: {},
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support take shop error:", error);
    return NextResponse.json({ error: "Failed to take this shop" }, { status: 500 });
  }
}
