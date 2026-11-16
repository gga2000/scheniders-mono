import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import type { SupportTeammate } from "@/lib/support";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/team — everyone a conversation can be handed to: active
 * console admins of a role that answers support. The hand-over function checks
 * the same rule again, so this list only saves a refused press.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await createAdminClient()
    .from("admin_users")
    .select("user_id, display_name, email")
    .eq("is_active", true)
    .in("admin_role", ["super_admin", "support_staff"]);
  if (error) {
    console.error("Support team API error:", error);
    return NextResponse.json({ error: "Failed to load the team" }, { status: 500 });
  }

  const rows = (data ?? []) as { user_id: string; display_name: string | null; email: string | null }[];
  const team = rows
    .map(
      (row): SupportTeammate => ({
        id: row.user_id,
        name: row.display_name?.trim() || row.email || "Support",
        isMe: row.user_id === admin.user.id,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ team });
}
