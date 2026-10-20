import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RenewalResult {
    tenant_id: string;
    business_name: string;
    plan: string;
    outcome: "renewed" | "plan_changed" | "suspended" | "error";
    details?: string;
}

/**
 * Cron: Renew subscriptions and charge monthly base price.
 * Runs daily at 3am UTC.
 *
 * For each subscription whose period has ended:
 * 1. Apply pending plan change if any
 * 2. Charge the monthly base_price_iqd via charge_wallet_atomic
 * 3. If charge succeeds: renew period (+30 days), set status active
 * 4. If charge fails: set subscription past_due, tenant suspended
 * 5. Reset usage_tracking for the new period
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
        .select("id, tenant_id, plan, status, pending_plan, plan_change_at")
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

    // 2. Get plan pricing
    const { data: planLimits } = await supabaseAdmin()
        .from("plan_limits")
        .select("plan, base_price_iqd");

    const priceByPlan: Record<string, number> = {};
    for (const pl of planLimits ?? []) {
        priceByPlan[pl.plan] = pl.base_price_iqd;
    }

    // 3. Get tenant names for logging
    const tenantIds = expiredSubs.map(s => s.tenant_id);
    const { data: tenants } = await supabaseAdmin()
        .from("tenants")
        .select("id, business_name")
        .in("id", tenantIds);

    const nameMap: Record<string, string> = {};
    for (const t of tenants ?? []) nameMap[t.id] = t.business_name;

    // 4. Process each subscription
    for (const sub of expiredSubs) {
        const name = nameMap[sub.tenant_id] || "Unknown";
        let plan = sub.plan;
        let planChanged = false;

        try {
            // Apply pending plan change
            if (sub.pending_plan) {
                plan = sub.pending_plan;
                planChanged = true;

                await supabaseAdmin()
                    .from("subscriptions")
                    .update({ plan, pending_plan: null, plan_change_at: null })
                    .eq("id", sub.id);

                await supabaseAdmin()
                    .from("tenants")
                    .update({ plan })
                    .eq("id", sub.tenant_id);

                console.log(`[subscription-renew] ${name}: plan ${sub.plan} → ${plan}`);
            }

            // Look up price
            const price = priceByPlan[plan] ?? 0;

            // Charge wallet
            if (price > 0) {
                const { data: result, error: rpcError } = await supabaseAdmin()
                    .rpc("charge_wallet_atomic", {
                        _tenant_id: sub.tenant_id,
                        _amount: price,
                        _description: `Monthly subscription - ${plan} plan`,
                        _order_id: null,
                    });

                if (rpcError) throw new Error(`RPC error: ${rpcError.message}`);

                if (!result?.success) {
                    // Insufficient balance → suspend
                    await supabaseAdmin()
                        .from("subscriptions")
                        .update({ status: "past_due" })
                        .eq("id", sub.id);

                    await supabaseAdmin()
                        .from("tenants")
                        .update({ status: "suspended" })
                        .eq("id", sub.tenant_id);

                    results.push({ tenant_id: sub.tenant_id, business_name: name, plan, outcome: "suspended", details: result?.error });
                    console.log(`[subscription-renew] ${name}: suspended (${result?.error})`);
                    continue;
                }
            }

            // Renew period (+30 days)
            const periodStart = new Date();
            const periodEnd = new Date();
            periodEnd.setDate(periodEnd.getDate() + 30);

            await supabaseAdmin()
                .from("subscriptions")
                .update({
                    status: "active",
                    current_period_start: periodStart.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                })
                .eq("id", sub.id);

            await supabaseAdmin()
                .from("tenants")
                .update({ status: "active" })
                .eq("id", sub.tenant_id);

            // Reset usage for new period
            const year = periodStart.getFullYear();
            const month = periodStart.getMonth() + 1;

            await supabaseAdmin()
                .from("usage_tracking")
                .upsert({
                    tenant_id: sub.tenant_id,
                    year,
                    month,
                    orders_count: 0,
                    orders_charged: 0,
                    last_updated_at: new Date().toISOString(),
                }, { onConflict: "tenant_id,year,month" });

            results.push({
                tenant_id: sub.tenant_id,
                business_name: name,
                plan,
                outcome: planChanged ? "plan_changed" : "renewed",
                details: price > 0 ? `Charged ${price} IQD` : "Free plan",
            });

            console.log(`[subscription-renew] ${name}: renewed (${plan}, ${price} IQD)`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[subscription-renew] ${name}: error -`, msg);
            results.push({ tenant_id: sub.tenant_id, business_name: name, plan, outcome: "error", details: msg });
        }
    }

    const renewed = results.filter(r => r.outcome === "renewed" || r.outcome === "plan_changed").length;
    const suspended = results.filter(r => r.outcome === "suspended").length;

    console.log(`[subscription-renew] Done: ${renewed} renewed, ${suspended} suspended`);

    return NextResponse.json({ success: true, renewed, suspended, results });
}
