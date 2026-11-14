import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_READ_ROLES } from "@/lib/waseet-caller";
import { fetchCities } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/cities
 *
 * Proxy to Al-Waseet GET /citys endpoint.
 * Returns the list of cities for city mapping configuration.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_READ_ROLES);
        if (!caller.ok) return caller.response;

        const result = await fetchCities();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Cities fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch cities" },
            { status: 500 }
        );
    }
}

export const GET = withFailureReport("api/waseet/cities GET", handleGET);
