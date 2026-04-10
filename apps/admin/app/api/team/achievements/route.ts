import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET() {
  try {
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
