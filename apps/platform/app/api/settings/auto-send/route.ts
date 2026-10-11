import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";

export const dynamic = "force-dynamic";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

const SETTINGS_KEY = "whatsapp_auto_send";

/**
 * GET /api/settings/auto-send
 * Returns the caller's tenant's auto-send toggle state.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    try {
        const { data, error } = await supabaseAdmin()
            .from("app_settings")
            .select("value")
            .eq("key", SETTINGS_KEY)
            .eq("tenant_id", caller.tenantId)
            .maybeSingle();

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
 * Updates the caller's tenant's auto-send toggle state (tenant admins only).
 * Body: { enabled: boolean, default_discount_percent?: number }
 */
export async function PUT(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;
    try {
        const body = await request.json();
        const enabled = body.enabled === true;
        const defaultDiscount = body.default_discount_percent ?? 10;

        const value = { enabled, default_discount_percent: defaultDiscount };

        const { error } = await supabaseAdmin()
            .from("app_settings")
            .upsert(
                {
                    key: SETTINGS_KEY,
                    tenant_id: caller.tenantId,
                    value,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "key,tenant_id" },
            );

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
