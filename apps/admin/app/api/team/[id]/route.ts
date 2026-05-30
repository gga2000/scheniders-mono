import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin-supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = _request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const supabase = createAdminClient();

    const [userResult, leadsResult, actionsResult, commissionsResult, achievementsResult] =
      await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, email, display_name, avatar_url, role, is_active, last_login_at")
          .eq("id", id)
          .single(),
        supabase
          .from("leads")
          .select("id, status, prospect_tenant_id")
          .or(`created_by.eq.${id},assigned_to.eq.${id}`),
        supabase
          .from("admin_employee_tracking")
          .select("*")
          .eq("admin_user_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
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

    const userLeads = leadsResult.data ?? [];

    return NextResponse.json({
      employee: {
        ...userResult.data,
        leads_added: userLeads.length,
        leads_converted: userLeads.filter((l) => l.status === "converted").length,
        stores_built: userLeads.filter((l) => l.prospect_tenant_id).length,
        total_actions: actionsResult.data?.length ?? 0,
        commission_earned: (commissionsResult.data ?? [])
          .filter((c) => c.status === "paid")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        commission_pending: (commissionsResult.data ?? [])
          .filter((c) => c.status === "pending")
          .reduce((sum, c) => sum + c.amount_earned, 0),
        achievements: (achievementsResult.data ?? []).map((a) => a.achievement_key),
      },
      recent_actions: actionsResult.data ?? [],
      commissions: commissionsResult.data ?? [],
      achievements: (achievementsResult.data ?? []).map((a) => a.achievement_key),
    });
  } catch (error) {
    console.error("Employee GET error:", error);
    return NextResponse.json({ error: "Failed to fetch employee" }, { status: 500 });
  }
}
