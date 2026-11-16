"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * The shop's billing lock (handoff A1), as billing_lock_status returns it
 * (20261116014641_billing_lock_instead_of_suspend.sql). A shop whose trial
 * ended, or whose month could not be paid, is locked: orders, shipping and
 * paying stay open, everything else shows the lock screen, and the storefront
 * takes `orders_left` more orders before it pauses.
 */
const billingLockSchema = z.object({
    locked: z.boolean(),
    reason: z.enum(["trial_ended", "unpaid"]).nullable(),
    since: z.string().nullable(),
    orders_left: z.number().int().nullable(),
    allowance: z.number().int(),
    plan: z.string().nullable(),
    price_iqd: z.coerce.number(),
    /** Only for the shop's admins. */
    balance_iqd: z.coerce.number().nullable(),
    /**
     * What the shop spends from its wallet a day: its last 7 days of
     * delivered-order fees and WhatsApp messages over 7 (Fermi B3 part 2).
     * Only for the shop's admins.
     */
    daily_spend_iqd: z.coerce.number().nullable().default(null),
    can_pay: z.boolean(),
});

export type BillingLock = z.infer<typeof billingLockSchema>;

const payResultSchema = z.object({
    success: z.boolean(),
    outcome: z.string(),
    error: z.string().optional(),
});

export const billingLockKey = (tenantId: string | null) => ["billing_lock", tenantId] as const;

export function useBillingLock(enabled = true) {
    const { tenantId } = useAuth();
    return useQuery<BillingLock>({
        queryKey: billingLockKey(tenantId),
        enabled: enabled && !!tenantId,
        // The lock starts when a date passes and ends the moment a payment
        // lands, so it is re-read on focus and every minute.
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("billing_lock_status", { p_tenant_id: tenantId! });
            if (error) throw error;
            return billingLockSchema.parse(data);
        },
    });
}

/** Pay the locked month from the wallet (shop admins). Resolves to whether the shop is now unlocked. */
export function usePayBillingLock() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.rpc("pay_billing_lock", { p_tenant_id: tenantId! });
            if (error) throw error;
            const result = payResultSchema.parse(data);
            return result.outcome === "renewed" || result.outcome === "plan_changed" || result.outcome === "not_locked";
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: billingLockKey(tenantId) });
            queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["wallet"] });
            queryClient.invalidateQueries({ queryKey: ["subscription"] });
        },
    });
}
