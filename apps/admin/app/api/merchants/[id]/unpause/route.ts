import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { logAdminActivity } from "@/lib/activity-logger";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      adminUserId: "system",
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
