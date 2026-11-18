import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";
import { NOT_OWN_STEPS_LIST, STAFF_LOG_COLUMNS, toStaffAction } from "@/lib/staff-actions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    // The staff log: what this person did, newest first.
    const { data, error, count } = await supabase
      .from("admin_activity_logs")
      .select(STAFF_LOG_COLUMNS, { count: "exact" })
      .eq("admin_user_id", id)
      .filter("action", "not.in", NOT_OWN_STEPS_LIST)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      actions: (data ?? []).map(toStaffAction),
      total: count ?? 0,
    });
  } catch (error) {
    console.error("Employee actions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 });
  }
}
