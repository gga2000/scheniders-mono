import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    const { data, error, count } = await supabase
      .from("admin_employee_tracking")
      .select("*", { count: "exact" })
      .eq("admin_user_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      actions: data ?? [],
      total: count ?? 0,
    });
  } catch (error) {
    console.error("Employee actions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 });
  }
}
