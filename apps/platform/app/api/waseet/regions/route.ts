import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_READ_ROLES } from "@/lib/waseet-caller";
import { fetchRegions } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/regions?city_id=ID
 *
 * Proxy to Al-Waseet GET /regions?city_id= endpoint.
 * Returns the list of regions for a specific city.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_READ_ROLES);
        if (!caller.ok) return caller.response;

        const cityId = request.nextUrl.searchParams.get("city_id");
        if (!cityId) {
            return NextResponse.json({ success: false, error: "city_id parameter is required" }, { status: 400 });
        }

        const result = await fetchRegions(Number(cityId));

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Regions fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch regions" },
            { status: 500 }
        );
    }
}

export const GET = withFailureReport("api/waseet/regions GET", handleGET);
