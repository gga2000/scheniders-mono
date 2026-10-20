import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron: Suspend tenants whose trial has expired.
 * Runs daily. Sets status = 'suspended' for any tenant still on 'trial'
 * whose trial_ends_at is in the past.
 */
export async function GET(request: Request) {
    // With CRON_SECRET unset the old inline check compared against the
    // literal "Bearer undefined"; the shared helper fails closed instead.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const now = new Date().toISOString();

    // Find and suspend expired trials
    const { data: expired, error } = await supabaseAdmin()
        .from("tenants")
        .update({ status: "suspended" })
        .eq("status", "trial")
        .lt("trial_ends_at", now)
        .select("id, business_name, trial_ends_at");

    if (error) {
        console.error("[trial-suspend] Error suspending expired trials:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = expired?.length ?? 0;
    console.log(`[trial-suspend] Suspended ${count} expired trial(s)`, expired);

    return NextResponse.json({
        success: true,
        suspended_count: count,
        suspended: expired?.map(t => t.business_name) ?? [],
    });
}
