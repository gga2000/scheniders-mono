import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { EXEMPT_PLANS_SQL_LIST } from "@/lib/billing-exempt";
import { requireCronAuth } from "@/lib/cron-auth";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron: Suspend tenants whose trial has expired and that nothing else will bill.
 * Runs daily at 06:00 UTC.
 *
 * A trial with a `trialing` subscription is ended by subscription-renew (03:00
 * UTC), which charges the first month and makes the shop active, or suspends it
 * when the wallet cannot pay. Suspending such a tenant here skipped that charge:
 * a trial that ended between 03:00 and 06:00 was locked out instead of billed.
 * So this job only catches trials with no subscription to renew.
 */
export async function GET(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const now = new Date().toISOString();

    const { data: candidates, error: fetchError } = await supabaseAdmin()
        .from("tenants")
        .select("id")
        .eq("status", "trial")
        .lt("trial_ends_at", now)
        // The house tier is never billed, so an expiring trial date must never
        // suspend it — that locked the operator out of their own dashboard.
        .not("plan", "in", EXEMPT_PLANS_SQL_LIST);

    if (fetchError) {
        console.error("[trial-suspend] Error reading expired trials:", fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const candidateIds = (candidates ?? []).map(t => t.id);
    if (candidateIds.length === 0) {
        console.log("[trial-suspend] Suspended 0 expired trial(s)");
        return NextResponse.json({ success: true, suspended_count: 0, suspended: [] });
    }

    const { data: renewable, error: subError } = await supabaseAdmin()
        .from("subscriptions")
        .select("tenant_id")
        .in("tenant_id", candidateIds)
        .eq("status", "trialing");

    if (subError) {
        console.error("[trial-suspend] Error reading trial subscriptions:", subError);
        return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    const billedByRenewal = new Set((renewable ?? []).map(s => s.tenant_id));
    const toSuspend = candidateIds.filter(id => !billedByRenewal.has(id));
    if (toSuspend.length === 0) {
        console.log(`[trial-suspend] Suspended 0 expired trial(s); ${billedByRenewal.size} left to subscription-renew`);
        return NextResponse.json({ success: true, suspended_count: 0, suspended: [] });
    }

    const { data: expired, error } = await supabaseAdmin()
        .from("tenants")
        .update({ status: "suspended" })
        .in("id", toSuspend)
        // Re-checked in the write: a top-up or renewal between the read and
        // here may already have moved the tenant off 'trial'.
        .eq("status", "trial")
        .select("id, business_name, trial_ends_at");

    if (error) {
        console.error("[trial-suspend] Error suspending expired trials:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = expired?.length ?? 0;
    console.log(`[trial-suspend] Suspended ${count} expired trial(s); ${billedByRenewal.size} left to subscription-renew`, expired);

    return NextResponse.json({
        success: true,
        suspended_count: count,
        suspended: expired?.map(t => t.business_name) ?? [],
    });
}
