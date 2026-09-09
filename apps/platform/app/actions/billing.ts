"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { authFailure, requireTenantAdmin } from "@/lib/auth/require-caller";

const VALID_PLANS = ["starter", "growth", "professional", "enterprise"] as const;

/**
 * Schedule a plan change for a tenant.
 * The change takes effect at the end of the current billing period.
 */
export async function changePlanAction(
    tenantId: string,
    newPlan: string
): Promise<{ success: boolean; warning?: string; error?: string }> {
    // ORD-A12: changes what a tenant is billed, for a tenant id supplied by the
    // caller, as service-role. Admin of that tenant only.
    try {
        await requireTenantAdmin(tenantId);
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }

    if (!VALID_PLANS.includes(newPlan as (typeof VALID_PLANS)[number])) {
        return { success: false, error: "Invalid plan" };
    }

    const supabase = createSupabaseServiceClient();

    try {
        // Get current subscription
        const { data: subscription, error: subError } = await supabase
            .from("subscriptions")
            .select("id, plan, current_period_end")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (subError || !subscription) {
            return { success: false, error: "Subscription not found" };
        }

        if (subscription.plan === newPlan) {
            return { success: false, error: "Already on this plan" };
        }

        // Check if this is a downgrade — validate current usage against new plan limits
        let warning: string | undefined;

        const { data: newPlanLimits } = await supabase
            .from("plan_limits")
            .select("max_orders_per_month")
            .eq("plan", newPlan)
            .single();

        if (newPlanLimits && newPlanLimits.max_orders_per_month !== -1) {
            const now = new Date();
            const { data: usage } = await supabase
                .from("usage_tracking")
                .select("orders_count")
                .eq("tenant_id", tenantId)
                .eq("year", now.getFullYear())
                .eq("month", now.getMonth() + 1)
                .single();

            if (usage && usage.orders_count > newPlanLimits.max_orders_per_month) {
                warning = `Your current month's usage (${usage.orders_count} orders) exceeds the ${newPlan} plan limit of ${newPlanLimits.max_orders_per_month} orders. Overage fees will apply after the switch.`;
            }
        }

        // Schedule plan change at end of current billing period
        const { error: updateError } = await supabase
            .from("subscriptions")
            .update({
                pending_plan: newPlan,
                plan_change_at: subscription.current_period_end,
                updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);

        if (updateError) {
            return { success: false, error: `Failed to schedule plan change: ${updateError.message}` };
        }

        return { success: true, warning };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: msg };
    }
}
