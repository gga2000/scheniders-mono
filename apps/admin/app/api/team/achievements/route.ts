import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

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
