import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";
import { requireAdminPermission } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "reactivate_tenant");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tenants")
      .update({ status: "active", restrictions: {} })
      .eq("id", id)
      .select("id, status, restrictions")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: id,
      action: "unpause_tenant",
      details: {},
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unpause merchant error:", error);
    return NextResponse.json({ error: "Failed to unpause merchant" }, { status: 500 });
  }
}
