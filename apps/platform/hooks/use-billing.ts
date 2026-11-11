"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export interface WalletData {
    balance_iqd: number;
    threshold_iqd: number;
    total_charged_iqd: number;
    total_topped_up_iqd: number;
}

export interface SubscriptionData {
    id: string;
    plan: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at: string | null;
    cancelled_at: string | null;
    pending_plan: string | null;
    plan_change_at: string | null;
}

export interface PlanLimitsData {
    plan: string;
    max_orders_per_month: number;
    max_team_members: number;
    order_price_iqd: number;
    overage_price_iqd: number;
    base_price_iqd: number;
    trial_days: number;
    trial_order_cap: number;
    /** Per delivered utility message (confirmation, delivery update). */
    whatsapp_message_price_iqd: number;
    /** Per delivered marketing message (reminder, offer). */
    whatsapp_marketing_price_iqd: number;
    features: Record<string, boolean>;
}

export interface WalletTransaction {
    id: string;
    type: string;
    amount_iqd: number;
    balance_after_iqd: number;
    description: string | null;
    payment_method: string | null;
    reference_id: string | null;
    created_at: string;
}

export function useBilling() {
    const { tenantId } = useAuth();

    const wallet = useQuery({
        queryKey: ["wallet", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wallet")
                .select("balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd")
                .eq("tenant_id", tenantId!)
                .single();
            if (error) throw error;
            return data as WalletData;
        },
        enabled: !!tenantId,
    });

    const subscription = useQuery({
        queryKey: ["subscription", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("subscriptions")
                .select("id, plan, status, current_period_start, current_period_end, cancel_at, cancelled_at, pending_plan, plan_change_at")
                .eq("tenant_id", tenantId!)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
            if (error) throw error;
            return data as SubscriptionData;
        },
        enabled: !!tenantId,
    });

    const planLimits = useQuery({
        queryKey: ["plan_limits"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("plan_limits")
                .select("*")
                .order("base_price_iqd", { ascending: true });
            if (error) throw error;
            return data as PlanLimitsData[];
        },
    });

    const transactions = useQuery({
        queryKey: ["wallet_transactions", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wallet_transactions")
                .select("id, type, amount_iqd, balance_after_iqd, description, payment_method, reference_id, created_at")
                .eq("tenant_id", tenantId!)
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            return data as WalletTransaction[];
        },
        enabled: !!tenantId,
    });

    const isLoading = wallet.isLoading || subscription.isLoading || planLimits.isLoading;

    return {
        wallet: wallet.data ?? null,
        subscription: subscription.data ?? null,
        allPlans: planLimits.data ?? [],
        transactions: transactions.data ?? [],
        isLoading,
        refetch: () => {
            wallet.refetch();
            subscription.refetch();
            transactions.refetch();
        },
    };
}

/**
 * Real customer orders so far, the number the free trial is capped on. Same
 * rule as the database (order_is_billable): no test, guide practice, staff
 * "taken" stock, till sales, abandoned carts or unfinished checkouts.
 */
export function useTrialOrderCount(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["trial_order_count", tenantId],
        queryFn: async () => {
            const { count, error } = await supabase
                .from("orders")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantId!)
                .not("is_test", "is", true)
                .not("guide_practice", "is", true)
                .is("take_kind", null)
                .is("till_session_id", null)
                .is("abandoned_cart_at", null)
                .neq("status", "pending_checkout");
            if (error) throw error;
            return count ?? 0;
        },
        enabled: enabled && !!tenantId,
    });
}
