import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RenewalResult {
    tenant_id: string;
    business_name: string;
    plan: string;
    outcome: "renewed" | "plan_changed" | "suspended" | "already_processed" | "error";
    details?: string;
}

/** What renew_subscription_atomic returns (packages/supabase/migrations/20261020143700_*). */
const renewResultSchema = z.object({
    success: z.boolean(),
    outcome: z.enum(["renewed", "plan_changed", "suspended", "already_processed", "error"]),
    plan: z.string().optional(),
    charged: z.coerce.number().optional(),
    error: z.string().optional(),
});

/**
 * Cron: Renew subscriptions and charge monthly base price.
 * Runs daily at 3am UTC.
 *
 * Each due subscription is renewed by renew_subscription_atomic, which in ONE
 * transaction: locks the subscription row, re-checks that the period the cron
 * saw is still the current, due period (compare-and-set on
 * current_period_end), applies a pending plan change, charges base_price_iqd
 * via charge_wallet_atomic with a per-period reference, then advances the
 * period +30 days and resets usage — or marks it past_due + suspends the
 * tenant when the charge fails.
 *
 * That makes the cron idempotent: a retry, an overlapping run, or a crash
 * after the charge can never charge the same period twice (the period either
 * advanced in the same transaction as the charge, or neither happened). A
 * unique index on the per-period reference backs this up in the ledger.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();
    const results: RenewalResult[] = [];

    // 1. Find expired subscriptions
    const { data: expiredSubs, error: fetchError } = await supabaseAdmin()
        .from("subscriptions")
        .select("id, tenant_id, plan, current_period_end")
        .in("status", ["active", "trialing"])
        .lte("current_period_end", now);

    if (fetchError) {
        console.error("[subscription-renew] Fetch error:", fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expiredSubs || expiredSubs.length === 0) {
        return NextResponse.json({ success: true, renewed: 0, suspended: 0, results: [] });
    }

    console.log(`[subscription-renew] ${expiredSubs.length} subscription(s) due for renewal`);

    // 2. Get tenant names for logging
    const tenantIds = expiredSubs.map(s => s.tenant_id);
    const { data: tenants } = await supabaseAdmin()
        .from("tenants")
        .select("id, business_name")
        .in("id", tenantIds);

    const nameMap: Record<string, string> = {};
    for (const t of tenants ?? []) nameMap[t.id] = t.business_name;

    // 3. Renew each subscription atomically
    for (const sub of expiredSubs) {
        const name = nameMap[sub.tenant_id] || "Unknown";

        const { data, error: rpcError } = await supabaseAdmin().rpc("renew_subscription_atomic", {
            _subscription_id: sub.id,
            _expected_period_end: sub.current_period_end,
        });

        if (rpcError) {
            console.error(`[subscription-renew] ${name}: error -`, rpcError.message);
            results.push({ tenant_id: sub.tenant_id, business_name: name, plan: sub.plan, outcome: "error", details: rpcError.message });
            continue;
        }

        const parsed = renewResultSchema.safeParse(data);
        if (!parsed.success) {
            console.error(`[subscription-renew] ${name}: unexpected RPC result`, parsed.error.message);
            results.push({ tenant_id: sub.tenant_id, business_name: name, plan: sub.plan, outcome: "error", details: "Unexpected renewal result" });
            continue;
        }

        const r = parsed.data;
        const plan = r.plan ?? sub.plan;
        const details =
            r.outcome === "suspended" || r.outcome === "error"
                ? r.error
                : r.outcome === "already_processed"
                  ? "Period already renewed by another run"
                  : r.charged && r.charged > 0
                    ? `Charged ${r.charged} IQD`
                    : "Free plan";

        results.push({ tenant_id: sub.tenant_id, business_name: name, plan, outcome: r.outcome, details });
        console.log(`[subscription-renew] ${name}: ${r.outcome} (${plan}${details ? `, ${details}` : ""})`);
    }

    const renewed = results.filter(r => r.outcome === "renewed" || r.outcome === "plan_changed").length;
    const suspended = results.filter(r => r.outcome === "suspended").length;
    const errors = results.filter(r => r.outcome === "error").length;

    console.log(`[subscription-renew] Done: ${renewed} renewed, ${suspended} suspended, ${errors} error(s)`);

    return NextResponse.json({ success: errors === 0, renewed, suspended, errors, results }, { status: errors === 0 ? 200 : 500 });
}
