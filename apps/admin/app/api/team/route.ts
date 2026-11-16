import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { fetchTeamCounts } from "@/lib/console-stats";

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
    if (userIds.length === 0) return NextResponse.json({ employees: [] });

    // Leads, actions and commissions are counted in the database
    // (admin_team_counts). Profiles and badges are a few rows per member of
    // staff. Any failed read fails the request: a zero here would read as
    // "did nothing".
    const [counts, profiles, achievements] = await Promise.all([
      fetchTeamCounts(supabase),
      supabase.from("user_profiles").select("id, email, display_name, avatar_url, last_login_at").in("id", userIds),
      supabase.from("admin_employee_achievements").select("admin_user_id, achievement_key").in("admin_user_id", userIds),
    ]);
    if (profiles.error) throw profiles.error;
    if (achievements.error) throw achievements.error;

    const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));

    const employees = (adminRows ?? []).map((row) => {
      const profile = profileById.get(row.user_id);
      const count = counts.get(row.user_id);
      if (!count) throw new Error(`No team counts for staff member ${row.user_id}`);

      return {
        id: row.user_id,
        email: profile?.email ?? row.email ?? "",
        display_name:
          profile?.display_name ?? row.display_name ?? profile?.email ?? row.email ?? "Unknown",
        avatar_url: profile?.avatar_url ?? null,
        role: row.admin_role,
        is_active: row.is_active,
        last_login_at: profile?.last_login_at ?? null,
        leads_added: count.leads_added,
        leads_converted: count.leads_converted,
        stores_built: count.stores_built,
        total_actions: count.total_actions,
        commission_earned: count.commission_earned,
        commission_pending: count.commission_pending,
        achievements: (achievements.data ?? [])
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
