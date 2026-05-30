import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const supabase = createAdminClient();

    await supabase.from("admin_employee_tracking").insert({
      admin_user_id: body.admin_user_id,
      action: body.action,
      entity_type: body.entity_type || null,
      entity_id: body.entity_id || null,
      metadata: body.metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch {
    // Silently fail - tracking should never return errors to the client
    return NextResponse.json({ success: true });
  }
}
