import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const admin = await requireBearerAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { error } = await supabase.from("admin_employee_tracking").insert({
      // The event belongs to the authenticated admin, never a client-supplied id.
      admin_user_id: admin.user.id,
      action: body.action,
      entity_type: body.entity_type || null,
      entity_id: body.entity_id || null,
      metadata: body.metadata || {},
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Employee tracking POST error:", error);
    return NextResponse.json({ error: "Failed to record tracking event" }, { status: 500 });
  }
}
