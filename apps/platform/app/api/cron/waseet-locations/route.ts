import { NextRequest, NextResponse } from "next/server";
import { syncLocationCatalog } from "@/lib/waseet-api";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";

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
async function runScheduled(request: NextRequest) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const result = await syncLocationCatalog("cron");

    if (!result.success) {
        // A warning in the log; the 502 is what raises it, once, through the
        // job monitor (a console.error would open a second Sentry issue).
        console.warn("[Waseet] Location sync failed:", result.error);
        return NextResponse.json({ success: false, error: result.error, data: result.data }, { status: 502 });
    }

    const d = result.data;
    console.log(
        `[Waseet] Location sync: ${d?.cities} cities, ${d?.regions} regions, ${d?.districts} districts, ` +
        `${d?.duplicates} duplicate names grouped, ${d?.splitNames} run-together names split, ` +
        `${d?.municipalities} municipalities, ${d?.postalCodes} postal codes, ${d?.overrides} overrides kept, ` +
        `${d?.reviewPairs} pairs flagged for review`
    );

    return NextResponse.json({ success: true, data: result.data });
}

export const GET = withCronMonitor(CRON_MONITORS.waseetLocations, runScheduled);
