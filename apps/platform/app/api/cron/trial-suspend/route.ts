import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron: Suspend tenants whose trial has expired.
 * Runs daily. Sets status = 'suspended' for any tenant still on 'trial'
 * whose trial_ends_at is in the past.
 */
export async function GET(request: Request) {
    // Verify cron secret (Vercel sends this header)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Find and suspend expired trials
    const { data: expired, error } = await supabaseAdmin
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
