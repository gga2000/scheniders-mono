import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SETTINGS_KEY = "whatsapp_auto_send";

/**
 * GET /api/settings/auto-send
 * Returns the current auto-send toggle state.
 */
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", SETTINGS_KEY)
            .single();

        if (error || !data) {
            return NextResponse.json({ enabled: false, default_discount_percent: 10 });
        }

        return NextResponse.json(data.value);
    } catch {
        return NextResponse.json({ enabled: false, default_discount_percent: 10 });
    }
}

/**
 * PUT /api/settings/auto-send
 * Updates the auto-send toggle state.
 * Body: { enabled: boolean, default_discount_percent?: number }
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const enabled = body.enabled === true;
        const defaultDiscount = body.default_discount_percent ?? 10;

        const value = { enabled, default_discount_percent: defaultDiscount };

        const { error } = await supabaseAdmin
            .from("app_settings")
            .upsert({
                key: SETTINGS_KEY,
                value,
                updated_at: new Date().toISOString(),
            });

        if (error) {
            console.error("[Settings] Failed to update auto-send:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[Settings] Auto-send ${enabled ? "ENABLED" : "DISABLED"}`);
        return NextResponse.json(value);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal error" },
            { status: 500 }
        );
    }
}
