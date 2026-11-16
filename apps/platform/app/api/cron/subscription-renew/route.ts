import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { EXEMPT_PLANS_SQL_LIST, isBillingExempt } from "@/lib/billing-exempt";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RenewalResult {
    tenant_id: string;
    business_name: string;
    plan: string;
    outcome: "renewed" | "plan_changed" | "locked" | "already_processed" | "exempt" | "on_hold" | "error";
    details?: string;
}

/** What renew_subscription_atomic returns (renew_subscription_core, 20261116114258_b13_demo_store_renewal_free.sql). */
const renewResultSchema = z.object({
    success: z.boolean(),
    outcome: z.enum(["renewed", "plan_changed", "locked", "already_processed", "exempt", "on_hold", "error"]),
    plan: z.string().optional(),
    charged: z.coerce.number().optional(),
    /** The demo store (B13): its month renews at no charge and is never locked. */
    demo: z.boolean().optional(),
    error: z.string().optional(),
});

/**
 * Cron: Renew subscriptions and charge monthly base price.
 * Runs daily at 3am UTC.
 *
 * First it reminds every shop whose paid month ends within 3 days (Fermi B3):
 * send_renewal_reminders tells it the date, the price and what the wallet
 * still needs, once per month however often this runs. A failed reminder run
 * is reported, and the renewals still run.
 *
 * Each due subscription is renewed by renew_subscription_atomic, which in ONE
 * transaction: locks the subscription row, re-checks that the period the cron
 * saw is still the current, due period (compare-and-set on
 * current_period_end), applies a pending plan change, charges base_price_iqd
 * from money in the wallet (no overdraft) with a per-period reference, then
 * advances the period +30 days and resets usage — or, when the wallet cannot
 * cover the month, marks it past_due, which LOCKS the shop (handoff A1: never
 * suspended; the hourly billing-lock job and any wallet credit pay it later).
 * A billing-exempt (`internal`) tenant is skipped here (lib/billing-exempt.ts)
 * and refused again inside the RPC, which returns outcome "exempt" without
 * charging, locking or touching the row. The demo store (B13) renews inside
 * the RPC at no charge, whatever its wallet holds (demo: true), so it is never
 * locked in front of a customer; it gets no reminder either.
 *
 * That makes the cron idempotent: a retry, an overlapping run, or a crash
 * after the charge can never charge the same period twice (the period either
 * advanced in the same transaction as the charge, or neither happened). A
 * unique index on the per-period reference backs this up in the ledger.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const now = new Date().toISOString();
    const results: RenewalResult[] = [];

    // 0. Remind shops whose month ends within 3 days.
    const { data: reminded, error: remindError } = await supabaseAdmin().rpc("send_renewal_reminders");
    if (remindError) console.error("[subscription-renew] Reminder error:", remindError.message);
    const reminders = remindError
        ? { reminded: 0, reminderError: remindError.message }
        : { reminded: typeof reminded === "number" ? reminded : 0 };

    // 1. Find expired subscriptions
    const { data: expiredSubs, error: fetchError } = await supabaseAdmin()
        .from("subscriptions")
        .select("id, tenant_id, plan, current_period_end")
        .in("status", ["active", "trialing"])
        .lte("current_period_end", now)
        // Never charge the house tier: a failed charge locks the shop, which is
        // exactly the lockout this tier exists to prevent.
        .not("plan", "in", EXEMPT_PLANS_SQL_LIST);

    if (fetchError) {
        console.error("[subscription-renew] Fetch error:", fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expiredSubs || expiredSubs.length === 0) {
        return NextResponse.json(
            { success: !remindError, ...reminders, renewed: 0, locked: 0, results: [] },
            { status: remindError ? 500 : 200 },
        );
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
        // stale subscription row naming a paid plan, and charging it would lock
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
            r.outcome === "locked" || r.outcome === "on_hold" || r.outcome === "error"
                ? r.error
                : r.outcome === "already_processed"
                  ? "Period already renewed by another run"
                  : r.outcome === "exempt"
                    ? "Billing-exempt plan: not charged"
                  : r.demo
                    ? "Demo store: not charged"
                  : r.charged && r.charged > 0
                    ? `Charged ${r.charged} IQD`
                    : "Free plan";

        results.push({ tenant_id: sub.tenant_id, business_name: name, plan, outcome: r.outcome, details });
        console.log(`[subscription-renew] ${name}: ${r.outcome} (${plan}${details ? `, ${details}` : ""})`);
    }

    const renewed = results.filter(r => r.outcome === "renewed" || r.outcome === "plan_changed").length;
    const locked = results.filter(r => r.outcome === "locked").length;
    const errors = results.filter(r => r.outcome === "error").length;

    console.log(`[subscription-renew] Done: ${renewed} renewed, ${locked} locked, ${errors} error(s)`);

    const ok = errors === 0 && !remindError;
    return NextResponse.json({ success: ok, ...reminders, renewed, locked, errors, results }, { status: ok ? 200 : 500 });
}

export const GET = withCronMonitor(CRON_MONITORS.subscriptionRenew, runScheduled);
