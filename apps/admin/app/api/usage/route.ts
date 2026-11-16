import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { addDays, dayOfWeek, daysEnding, fetchUsageStats } from "@/lib/console-stats";

export const dynamic = "force-dynamic";

const tenantIdSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const tenantParam = new URL(request.url).searchParams.get("tenant_id");
  const tenantId = tenantParam ? tenantIdSchema.safeParse(tenantParam) : null;
  if (tenantId && !tenantId.success) {
    return NextResponse.json({ error: "tenant_id must be a UUID" }, { status: 400 });
  }

  try {
    // Real orders per Baghdad day and hour, counted in the database. Fetching
    // the rows stopped at the API's 1,000-row cap, so the page went blank from
    // the 1,001st order of the year on.
    const usage = await fetchUsageStats(createAdminClient(), tenantId?.data ?? null);
    const countOn = (day: string) => usage.days[day] ?? 0;

    const heatmapData = daysEnding(usage.today, 365).map((date) => ({ date, count: countOn(date) }));

    const activeDays = heatmapData.filter((d) => d.count > 0);
    const busiestDays = [...activeDays].sort((a, b) => b.count - a.count).slice(0, 10);
    const quietestDays = activeDays.length > 10
      ? [...activeDays].sort((a, b) => a.count - b.count).slice(0, 10)
      : [];

    // 52 weeks, Sunday to Saturday, ending with the week in progress.
    const thisSunday = addDays(usage.today, -dayOfWeek(usage.today));
    const weeklyTrend = Array.from({ length: 52 }, (_, i) => {
      const week = addDays(thisSunday, (i - 51) * 7);
      const count = daysEnding(addDays(week, 6), 7).reduce((sum, day) => sum + countOn(day), 0);
      return { week, count };
    });

    return NextResponse.json({
      heatmapData,
      hourlyCounts: usage.hours,
      busiestDays,
      quietestDays,
      weeklyTrend,
      totalOrders: usage.total,
    });
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 });
  }
}
