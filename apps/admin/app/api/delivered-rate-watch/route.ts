import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { FAR_BELOW_MEDIAN_SHARE, STUCK_FLAG_MIN, daysParamSchema, deliveredRateWatchSchema, watchFlags } from "@/lib/delivered-rate-watch";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivered-rate-watch?days=60: each shop's delivered rate against
 * the platform median and its parcels in transit for more than 14 days, with
 * the reasons a shop is worth a look (lib/delivered-rate-watch). Read-only,
 * and for the owners only: it is about the fees we are owed, so it needs the
 * same permission as managing a shop's subscription.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_subscription");
  if (auth instanceof NextResponse) return auth;

  const days = daysParamSchema.safeParse(new URL(request.url).searchParams.get("days") ?? undefined);
  if (!days.success) {
    return NextResponse.json({ error: "days must be a whole number from 7 to 365" }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("admin_delivered_rate_watch", { p_days: days.data });
    if (error) throw error;
    const watch = deliveredRateWatchSchema.parse(data);
    const shops = watch.shops.map((shop) => ({ ...shop, flags: watchFlags(shop, watch.median_rate) }));
    return NextResponse.json({
      ...watch,
      shops,
      flagged: shops.filter((s) => s.flags.length > 0).length,
      rules: { farBelowMedianShare: FAR_BELOW_MEDIAN_SHARE, stuckFlagMin: STUCK_FLAG_MIN, stuckAfterDays: 14, minShippedForRate: 20 },
    });
  } catch (error) {
    console.error("Delivered-rate watch API error:", error);
    return NextResponse.json({ error: "Failed to load the delivered-rate watch" }, { status: 500 });
  }
}
