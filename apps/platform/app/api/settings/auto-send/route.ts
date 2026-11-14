import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { followUpWindowSchema, DEFAULT_FOLLOW_UP_WINDOW } from "@/lib/follow-up-window";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

const SETTINGS_KEY = "whatsapp_auto_send";

/**
 * GET /api/settings/auto-send
 * Returns the caller's tenant's auto-send toggle state.
 */
async function handleGET(request: NextRequest) {
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
            return NextResponse.json({ enabled: false, reminder_enabled: true, default_discount_percent: 10, reminder_window: DEFAULT_FOLLOW_UP_WINDOW });
        }

        return NextResponse.json({ reminder_enabled: true, reminder_window: DEFAULT_FOLLOW_UP_WINDOW, ...data.value });
    } catch {
        return NextResponse.json({ enabled: false, default_discount_percent: 10 });
    }
}

/**
 * PUT /api/settings/auto-send
 * Updates the caller's tenant's auto-send toggle state (tenant admins only).
 * Body: { enabled: boolean, default_discount_percent?: number }
 */
async function handlePUT(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;
    try {
        const body = await request.json();
        const defaultDiscount = body.default_discount_percent ?? 10;

        // Keep what the toggle doesn't send (the reminder window) instead of wiping it.
        const { data: existing } = await supabaseAdmin()
            .from("app_settings")
            .select("value")
            .eq("key", SETTINGS_KEY)
            .eq("tenant_id", caller.tenantId)
            .maybeSingle();
        const previous = (existing?.value ?? {}) as Record<string, unknown>;

        // The toggle sends only `enabled`, the reminder form never does: each
        // keeps the other's value instead of resetting it.
        const enabled = typeof body.enabled === "boolean" ? body.enabled : previous.enabled === true;
        const reminderEnabled =
            typeof body.reminder_enabled === "boolean" ? body.reminder_enabled : previous.reminder_enabled !== false;

        let reminderWindow = previous.reminder_window;
        if (body.reminder_window !== undefined) {
            const parsed = followUpWindowSchema.safeParse(body.reminder_window);
            if (!parsed.success) {
                return NextResponse.json({ error: "Invalid reminder_window" }, { status: 400 });
            }
            reminderWindow = parsed.data;
        }

        const value = {
            ...previous,
            enabled,
            reminder_enabled: reminderEnabled,
            default_discount_percent: defaultDiscount,
            ...(reminderWindow !== undefined ? { reminder_window: reminderWindow } : {}),
        };

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

export const GET = withFailureReport("api/settings/auto-send GET", handleGET);
export const PUT = withFailureReport("api/settings/auto-send PUT", handlePUT);
