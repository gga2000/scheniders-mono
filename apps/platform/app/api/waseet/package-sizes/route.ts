import { NextRequest, NextResponse } from "next/server";
import { authorizeWaseetCaller, WASEET_READ_ROLES } from "@/lib/waseet-caller";
import { fetchPackageSizes } from "@/lib/waseet-api";
import { withFailureReport } from "@/lib/job-monitor";

/**
 * GET /api/waseet/package-sizes
 *
 * Fetch Al-Waseet package sizes.
 */
async function handleGET(request: NextRequest) {
    try {
        const caller = await authorizeWaseetCaller(request, WASEET_READ_ROLES);
        if (!caller.ok) return caller.response;

        const result = await fetchPackageSizes();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Package sizes fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch package sizes" },
            { status: 500 }
        );
    }
}

export const GET = withFailureReport("api/waseet/package-sizes GET", handleGET);
