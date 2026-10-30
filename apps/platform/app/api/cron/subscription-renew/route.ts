import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { EXEMPT_PLANS_SQL_LIST, isBillingExempt } from "@/lib/billing-exempt";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RenewalResult {
    tenant_id: string;
    business_name: string;
    plan: string;
    outcome: "renewed" | "plan_changed" | "suspended" | "already_processed" | "exempt" | "error";
    details?: string;
}

/** What renew_subscription_atomic returns (packages/supabase/migrations/20261025232022_*). */
const renewResultSchema = z.object({
    success: z.boolean(),
    outcome: z.enum(["renewed", "plan_changed", "suspended", "already_processed", "exempt", "error"]),
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
 * tenant when the charge fails. A billing-exempt (`internal`) tenant is
 * skipped here (lib/billing-exempt.ts) and refused again inside the RPC, which
 * returns outcome "exempt" without charging, suspending or touching the row.
 *
 * That makes the cron idempotent: a retry, an overlapping run, or a crash
 * after the charge can never charge the same period twice (the period either
 * advanced in the same transaction as the charge, or neither happened). A
 * unique index on the per-period reference backs this up in the ledger.
 */
export async function GET(request: Request) {
    // With CRON_SECRET unset the old inline check compared against the
    // literal "Bearer undefined"; the shared helper fails closed instead.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const now = new Date().toISOString();
    const results: RenewalResult[] = [];

    // 1. Find expired subscriptions
    const { data: expiredSubs, error: fetchError } = await supabaseAdmin()
        .from("subscriptions")
        .select("id, tenant_id, plan, current_period_end")
        .in("status", ["active", "trialing"])
        .lte("current_period_end", now)
        // Never charge the house tier: a failed charge sets the tenant suspended,
        // which is exactly the lockout this tier exists to prevent.
        .not("plan", "in", EXEMPT_PLANS_SQL_LIST);

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
        .select("id, business_name, plan")
        .in("id", tenantIds);

    const nameMap: Record<string, string> = {};
    const planMap: Record<string, string> = {};
    for (const t of tenants ?? []) {
        nameMap[t.id] = t.business_name;
        planMap[t.id] = t.plan;
    }

    // 3. Renew each subscription atomically
    for (const sub of expiredSubs) {
        const name = nameMap[sub.tenant_id] || "Unknown";

        // The tenant's own plan is the authority: a house tenant may still carry a
        // stale subscription row naming a paid plan, and charging it would suspend
        // the account this tier exists to keep running.
        if (isBillingExempt(planMap[sub.tenant_id])) {
            console.log(`[subscription-renew] Skipping billing-exempt tenant ${name}`);
            continue;
        }

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
                  : r.outcome === "exempt"
                    ? "Billing-exempt plan: not charged"
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
