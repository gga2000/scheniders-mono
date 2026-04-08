import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchPackageSizes } from "@/lib/waseet-api";

/**
 * GET /api/waseet/package-sizes
 *
 * Fetch Al-Waseet package sizes and cache them in app_settings.
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

        const result = await fetchPackageSizes();

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 502 });
        }

        // Cache in app_settings for quick access
        const supabaseAdmin = createSupabaseServiceClient();
        await supabaseAdmin.from("app_settings").upsert({
            key: "waseet_package_sizes",
            value: result.data,
            updated_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        console.error("[Waseet] Package sizes fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch package sizes" },
            { status: 500 }
        );
    }
}
