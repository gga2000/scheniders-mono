import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("admin_employee_achievements")
      .select("*")
      .order("unlocked_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ achievements: data ?? [] });
  } catch (error) {
    console.error("Achievements GET error:", error);
    return NextResponse.json({ error: "Failed to fetch achievements" }, { status: 500 });
  }
}
