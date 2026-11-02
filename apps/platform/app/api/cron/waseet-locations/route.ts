import { NextRequest, NextResponse } from "next/server";
import { syncLocationCatalog } from "@/lib/waseet-api";
import { requireCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/waseet-locations
 *
 * Refreshes the `waseet_cities` / `waseet_regions` mirror of Al-Waseet's
 * delivery destinations. Weekly is plenty — Al-Waseet adds regions steadily
 * but an order can only use an id that already exists upstream, so the cost of
 * being a few days stale is a missing new neighbourhood, never a failed order.
 */
export async function GET(request: NextRequest) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const result = await syncLocationCatalog("cron");

    if (!result.success) {
        console.error("[Waseet] Location sync failed:", result.error);
        return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    console.log(
        `[Waseet] Location sync: ${result.data?.cities} cities, ${result.data?.districts} districts, ` +
        `${result.data?.regions} regions, ${result.data?.duplicates} duplicate names grouped, ` +
        `${result.data?.splitNames} run-together names split, ` +
        `${result.data?.reviewPairs} pairs flagged for review` +
        (result.data?.failedCities.length ? `, failed cities: ${result.data.failedCities.join(",")}` : "")
    );

    return NextResponse.json({ success: true, data: result.data });
}
