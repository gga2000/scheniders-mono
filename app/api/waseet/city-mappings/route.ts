import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/waseet/city-mappings
 * Fetch current governorate → Al-Waseet city/region mappings.
 *
 * POST /api/waseet/city-mappings
 * Save/update mappings (upsert by governorate_code).
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

        const supabaseAdmin = createSupabaseServiceClient();
        const { data, error } = await supabaseAdmin
            .from("waseet_city_mappings")
            .select("*")
            .order("governorate_name_ar", { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("[Waseet] City mappings fetch error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch city mappings" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { mappings } = body;

        if (!Array.isArray(mappings) || mappings.length === 0) {
            return NextResponse.json({ success: false, error: "mappings array is required" }, { status: 400 });
        }

        const supabaseAdmin = createSupabaseServiceClient();
        const now = new Date().toISOString();

        // Upsert each mapping by governorate_code
        const upsertData = mappings.map((m: {
            governorate_code: string;
            governorate_name_ar: string;
            waseet_city_id: number;
            waseet_city_name: string;
            waseet_default_region_id?: number;
            waseet_default_region_name?: string;
        }) => ({
            governorate_code: m.governorate_code,
            governorate_name_ar: m.governorate_name_ar,
            waseet_city_id: m.waseet_city_id,
            waseet_city_name: m.waseet_city_name,
            waseet_default_region_id: m.waseet_default_region_id || null,
            waseet_default_region_name: m.waseet_default_region_name || null,
            updated_at: now,
            is_active: true,
        }));

        const { error } = await supabaseAdmin
            .from("waseet_city_mappings")
            .upsert(upsertData, { onConflict: "governorate_code" });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: { saved: upsertData.length } });
    } catch (error) {
        console.error("[Waseet] City mappings save error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to save city mappings" },
            { status: 500 }
        );
    }
}
