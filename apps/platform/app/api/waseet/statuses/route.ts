import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_READ_ROLES } from "@/lib/waseet-caller";
import { fetchStatuses } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/statuses
 *
 * Fetch Al-Waseet order statuses.
 * Also serves as a connection test endpoint.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_READ_ROLES);
        if (!caller.ok) return caller.response;

        const result = await fetchStatuses();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Statuses fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch statuses" },
            { status: 500 }
        );
    }
}

export const GET = withFailureReport("api/waseet/statuses GET", handleGET);
