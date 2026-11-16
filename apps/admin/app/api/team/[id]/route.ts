import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { everyRow } from "@/lib/every-row";
import { notAnId } from "@/lib/route-id";
import { NOT_OWN_STEPS_LIST, STAFF_LOG_COLUMNS, toStaffAction, type StaffLogRow } from "@/lib/staff-actions";

/** The Performance chart's 14 days, with a day to spare for the browser's clock. */
const CHART_DAYS = 15;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireBearerAdmin(_request);
    if (admin instanceof NextResponse) return admin;

    // A staff id is a user id; anything else could change the leads filter below.
    const { id } = await params;
    const missing = notAnId(id);
    if (missing) return missing;
    const supabase = createAdminClient();

    const chartFrom = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [userResult, adminResult, leadsResult, actionCount, recentActions, commissionsResult, achievementsResult] =
      await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, email, display_name, avatar_url, last_login_at")
          .eq("id", id)
          .single(),
        supabase
          .from("admin_users")
          .select("admin_role, is_active")
          .eq("user_id", id)
          .maybeSingle(),
        supabase
          .from("leads")
          .select("id, status, prospect_tenant_id")
          .or(`created_by.eq.${id},assigned_to.eq.${id}`),
        // What this person did, from the staff log: every step counted, and
        // every step of the chart's days for the chart (not the last 50).
        supabase
          .from("admin_activity_logs")
          .select("id", { count: "exact", head: true })
          .eq("admin_user_id", id)
          .filter("action", "not.in", NOT_OWN_STEPS_LIST),
        everyRow<StaffLogRow>((from, to) =>
          supabase
            .from("admin_activity_logs")
            .select(STAFF_LOG_COLUMNS)
            .eq("admin_user_id", id)
            .filter("action", "not.in", NOT_OWN_STEPS_LIST)
            .gte("created_at", chartFrom)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to)
        ),
        supabase
          .from("admin_employee_commissions")
          .select("*, lead:leads(merchant_name), tenant:tenants(business_name, slug)")
          .eq("admin_user_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("admin_employee_achievements")
          .select("achievement_key, unlocked_at")
          .eq("admin_user_id", id),
      ]);

    if (userResult.error) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (actionCount.error) throw actionCount.error;

    const userLeads = leadsResult.data ?? [];

    return NextResponse.json({
      employee: {
        ...userResult.data,
        role: adminResult.data?.admin_role ?? null,
        is_active: adminResult.data?.is_active ?? false,
        leads_added: userLeads.length,
        leads_converted: userLeads.filter((l) => l.status === "converted").length,
        stores_built: userLeads.filter((l) => l.prospect_tenant_id).length,
        total_actions: actionCount.count ?? 0,
        // As on the Team page (admin_team_counts): every commission is earned,
        // and the ones not paid yet (pending or approved) are waiting.
        commission_earned: (commissionsResult.data ?? []).reduce((sum, c) => sum + c.amount_earned, 0),
        commission_pending: (commissionsResult.data ?? [])
          .filter((c) => c.status !== "paid")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        achievements: (achievementsResult.data ?? []).map((a) => a.achievement_key),
      },
      recent_actions: recentActions.map(toStaffAction),
      commissions: commissionsResult.data ?? [],
      achievements: (achievementsResult.data ?? []).map((a) => a.achievement_key),
    });
  } catch (error) {
    console.error("Employee GET error:", error);
    return NextResponse.json({ error: "Failed to fetch employee" }, { status: 500 });
  }
}
