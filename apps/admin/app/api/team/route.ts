import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const supabase = createAdminClient();

    // The admin-console roster lives in `admin_users` (decoupled from the main
    // app's user_profiles.role).
    const { data: adminRows, error } = await supabase
      .from("admin_users")
      .select("user_id, admin_role, is_active, display_name, email")
      .order("display_name");

    if (error) throw error;

    const userIds = (adminRows ?? []).map((a) => a.user_id);

    // Fresh profile fields (display_name / avatar / last_login) for those users.
    const { data: profiles } = userIds.length > 0
      ? await supabase
          .from("user_profiles")
          .select("id, email, display_name, avatar_url, last_login_at")
          .in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Fetch lead stats per user
    const { data: leadStats } = await supabase
      .from("leads")
      .select("created_by, assigned_to, status, prospect_tenant_id");

    // Fetch action counts
    const { data: actionCounts } = userIds.length > 0
      ? await supabase
          .from("admin_employee_tracking")
          .select("admin_user_id")
          .in("admin_user_id", userIds)
      : { data: [] };

    // Fetch commissions
    const { data: commissions } = userIds.length > 0
      ? await supabase
          .from("admin_employee_commissions")
          .select("admin_user_id, amount_earned, status")
          .in("admin_user_id", userIds)
      : { data: [] };

    // Fetch achievements
    const { data: achievements } = userIds.length > 0
      ? await supabase
          .from("admin_employee_achievements")
          .select("admin_user_id, achievement_key")
          .in("admin_user_id", userIds)
      : { data: [] };

    const employees = (adminRows ?? []).map((row) => {
      const profile = profileById.get(row.user_id);
      const userLeads = (leadStats ?? []).filter(
        (l) => l.created_by === row.user_id || l.assigned_to === row.user_id
      );

      return {
        id: row.user_id,
        email: profile?.email ?? row.email ?? "",
        display_name:
          profile?.display_name ?? row.display_name ?? profile?.email ?? row.email ?? "Unknown",
        avatar_url: profile?.avatar_url ?? null,
        role: row.admin_role,
        is_active: row.is_active,
        last_login_at: profile?.last_login_at ?? null,
        leads_added: userLeads.filter((l) => l.created_by === row.user_id).length,
        leads_converted: userLeads.filter((l) => l.status === "converted").length,
        stores_built: userLeads.filter((l) => l.prospect_tenant_id).length,
        total_actions: (actionCounts ?? []).filter((a) => a.admin_user_id === row.user_id).length,
        commission_earned: (commissions ?? [])
          .filter((c) => c.admin_user_id === row.user_id && c.status === "paid")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        commission_pending: (commissions ?? [])
          .filter((c) => c.admin_user_id === row.user_id && c.status === "pending")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        achievements: (achievements ?? [])
          .filter((a) => a.admin_user_id === row.user_id)
          .map((a) => a.achievement_key),
      };
    });

    return NextResponse.json({ employees });
  } catch (error) {
    console.error("Team GET error:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}
