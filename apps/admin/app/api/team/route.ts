import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch all admin users
    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("id, email, display_name, avatar_url, role, is_active, last_login_at")
      .in("role", ["super_admin", "support_staff"])
      .order("display_name");

    if (error) throw error;

    const userIds = (users ?? []).map((u) => u.id);

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

    const employees = (users ?? []).map((user) => {
      const userLeads = (leadStats ?? []).filter(
        (l) => l.created_by === user.id || l.assigned_to === user.id
      );

      return {
        ...user,
        leads_added: userLeads.filter((l) => l.created_by === user.id).length,
        leads_converted: userLeads.filter((l) => l.status === "converted").length,
        stores_built: userLeads.filter((l) => l.prospect_tenant_id).length,
        total_actions: (actionCounts ?? []).filter((a) => a.admin_user_id === user.id).length,
        commission_earned: (commissions ?? [])
          .filter((c) => c.admin_user_id === user.id && c.status === "paid")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        commission_pending: (commissions ?? [])
          .filter((c) => c.admin_user_id === user.id && c.status === "pending")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        achievements: (achievements ?? [])
          .filter((a) => a.admin_user_id === user.id)
          .map((a) => a.achievement_key),
      };
    });

    return NextResponse.json({ employees });
  } catch (error) {
    console.error("Team GET error:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}
