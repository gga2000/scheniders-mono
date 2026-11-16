import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { feesOf, fetchIncomeStats, monthLabel } from "@/lib/console-stats";
import { calculateMerchantLTV } from "@/lib/dashboard-calculations";
import { everyRow } from "@/lib/every-row";

export const dynamic = "force-dynamic";

const MONTHS_SHOWN = 6;

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [income, shops] = await Promise.all([
      fetchIncomeStats(supabase),
      // Every shop, a page at a time: one read stops at 1,000 rows and the
      // average lifetime value would quietly leave the rest out.
      everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, created_at")
          // The demo store (Fermi B13) is in no platform number.
          .eq("is_demo", false)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

    // Income is the fees we charge (monthly plan, delivered orders, paid
    // messages), summed in the database by Baghdad month. Any other wallet
    // charge is a correction and is reported apart, never as income.
    const months = income.monthly.slice(-MONTHS_SHOWN);
    const mrrWaterfall = months.map((m) => ({ month: monthLabel(m.month), revenue: feesOf(m) }));
    const otherCharges = months.reduce((sum, m) => sum + m.other, 0);

    const cohorts = income.cohorts.map((c) => ({ cohort: c.cohort, tenantCount: c.tenants, months: c.months }));

    const ltv = calculateMerchantLTV(shops, income.byTenant, income.today, 10);

    const monthIndex = new Map(months.map((m, i) => [m.month, i]));
    const planFees = new Map<string, number[]>();
    for (const row of income.byPlan) {
      const i = monthIndex.get(row.month);
      if (i === undefined) continue;
      const data = planFees.get(row.plan) ?? new Array<number>(MONTHS_SHOWN).fill(0);
      data[i] += row.amount;
      planFees.set(row.plan, data);
    }

    return NextResponse.json({
      mrrWaterfall,
      otherCharges,
      cohorts,
      ltvDistribution: ltv.distribution.map((d) => ({ label: d.bucket, count: d.count })),
      topLTV: ltv.topMerchants.map((m) => ({ id: m.tenantId, name: m.businessName, revenue: m.totalRevenue })),
      avgLTV: ltv.avgLTV,
      revenueByPlan: [...planFees].map(([plan, data]) => ({ plan, data })),
      monthLabels: months.map((m) => monthLabel(m.month)),
    });
  } catch (error) {
    console.error("Revenue API error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
