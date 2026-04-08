import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { fetchRegions } from "@/lib/waseet-api";

/**
 * GET /api/waseet/regions?city_id=ID
 *
 * Proxy to Al-Waseet GET /regions?city_id= endpoint.
 * Returns the list of regions for a specific city.
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ success: false, error: "Missing Authorization header" }, { status: 401 });
        }

        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

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
