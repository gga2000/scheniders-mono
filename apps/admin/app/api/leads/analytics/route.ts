import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const supabase = createAdminClient();

    // Fetch all leads for analytics — drafts are unfinished and excluded so they
    // never inflate pipeline counts or revenue forecasts.
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, status, platform, tier, industry_id, lead_score, estimated_monthly_revenue, assigned_to, created_by, created_at, converted_at, industry:industries(name)")
      .eq("is_draft", false);

    if (error) throw error;

    const allLeads = leads ?? [];
    const total = allLeads.length;

    // By status
    const by_status: Record<string, number> = {};
    for (const l of allLeads) {
      by_status[l.status] = (by_status[l.status] || 0) + 1;
    }

    // By platform
    const by_platform: Record<string, number> = {};
    for (const l of allLeads) {
      by_platform[l.platform] = (by_platform[l.platform] || 0) + 1;
    }

    // By tier
    const by_tier: Record<string, number> = {};
    for (const l of allLeads) {
      by_tier[l.tier] = (by_tier[l.tier] || 0) + 1;
    }

    // By industry
    const industryMap = new Map<string, number>();
    for (const l of allLeads) {
      const ind = l.industry as unknown as { name: string } | { name: string }[] | null;
      const name = (Array.isArray(ind) ? ind[0]?.name : ind?.name) || "Uncategorized";
      industryMap.set(name, (industryMap.get(name) || 0) + 1);
    }
    const by_industry = Array.from(industryMap.entries()).map(([industry_name, count]) => ({ industry_name, count }));

    // Conversion rate
    const converted = allLeads.filter((l) => l.status === "converted").length;
    const conversion_rate = total > 0 ? (converted / total) * 100 : 0;

    // Avg time to convert
    const convertedLeads = allLeads.filter((l) => l.converted_at);
    let avg_time_to_convert_days = 0;
    if (convertedLeads.length > 0) {
      const totalDays = convertedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at).getTime();
        const convertedAt = new Date(l.converted_at!).getTime();
        return sum + (convertedAt - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avg_time_to_convert_days = Math.round(totalDays / convertedLeads.length);
    }

    // Total estimated revenue
    const total_estimated_revenue = allLeads
      .filter((l) => l.status !== "converted" && l.status !== "lost")
      .reduce((sum, l) => sum + (l.estimated_monthly_revenue || 0), 0);

    // Top employees
    const employeeStats = new Map<string, { leads_added: number; leads_converted: number }>();
    for (const l of allLeads) {
      const empId = l.assigned_to || l.created_by;
      if (!empId) continue;
      const stats = employeeStats.get(empId) || { leads_added: 0, leads_converted: 0 };
      stats.leads_added++;
      if (l.status === "converted") stats.leads_converted++;
      employeeStats.set(empId, stats);
    }

    // Fetch employee names
    const empIds = Array.from(employeeStats.keys());
    const { data: profiles } = empIds.length > 0
      ? await supabase.from("user_profiles").select("id, display_name").in("id", empIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    const top_employees = Array.from(employeeStats.entries())
      .map(([user_id, stats]) => ({
        user_id,
        display_name: profileMap.get(user_id) || null,
        ...stats,
        commission_earned: 0,
      }))
      .sort((a, b) => b.leads_converted - a.leads_converted)
      .slice(0, 10);

    // Monthly trends (last 6 months)
    const monthly_trends: { month: string; added: number; converted: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const added = allLeads.filter((l) => l.created_at.startsWith(monthStr)).length;
      const conv = allLeads.filter((l) => l.converted_at?.startsWith(monthStr)).length;
      monthly_trends.push({ month: monthStr, added, converted: conv });
    }

    return NextResponse.json({
      total_leads: total,
      by_status,
      by_platform,
      by_tier,
      by_industry,
      conversion_rate: Math.round(conversion_rate * 10) / 10,
      avg_time_to_convert_days,
      total_estimated_revenue,
      top_employees,
      monthly_trends,
    });
  } catch (error) {
    console.error("Lead analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
