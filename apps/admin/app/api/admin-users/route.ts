import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, display_name, role")
      .in("role", ["super_admin", "support_staff"])
      .order("display_name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      users: (data ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        display_name: u.display_name ?? u.email ?? "Unknown",
        role: u.role,
      })),
    });
  } catch (error) {
    console.error("Admin users API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin users" },
      { status: 500 }
    );
  }
}
