import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchStatuses } from "@/lib/waseet-api";

/**
 * GET /api/waseet/statuses
 *
 * Fetch Al-Waseet order statuses and cache them.
 * Also serves as a connection test endpoint.
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

        const result = await fetchStatuses();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        // Cache statuses in app_settings
        const supabaseAdmin = createSupabaseServiceClient();
        await supabaseAdmin.from("app_settings").upsert({
            key: "waseet_statuses",
            value: result.data,
            updated_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Statuses fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch statuses" },
            { status: 500 }
        );
    }
}
