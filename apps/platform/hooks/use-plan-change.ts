"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { billingLockKey } from "@/hooks/use-billing-lock";

/**
 * Plan changes and add-ons (Fermi B1). The database decides everything a
 * change costs and when it starts: change_plan / set_addon_quantity with
 * p_apply false return the quote the confirm dialog shows, and the same body
 * with p_apply true does it, so the dialog and the charge cannot disagree.
 */

export const ADDON_KINDS = ["extra_member", "pos_branch"] as const;
export type AddonKind = (typeof ADDON_KINDS)[number];

const refusalSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    seats_used: z.number().optional(),
    seat_limit: z.number().optional(),
    branches_used: z.number().optional(),
    branch_limit: z.number().optional(),
    in_use: z.number().optional(),
    limit: z.number().optional(),
    charge_now_iqd: z.number().optional(),
    balance_iqd: z.number().optional(),
    plan: z.string().optional(),
});

const planQuoteSchema = z.object({
    success: z.literal(true),
    kind: z.enum(["pick", "keep", "upgrade", "downgrade"]),
    plan: z.string(),
    current_plan: z.string(),
    pending_plan: z.string().nullable(),
    monthly_iqd: z.number(),
    order_fee_iqd: z.number(),
    charge_now_iqd: z.number(),
    effective_at: z.string().nullable(),
    period_end: z.string().nullable(),
    seat_limit: z.number().nullable(),
    seats_used: z.number(),
    balance_iqd: z.number(),
    balance_ok: z.boolean(),
    applied: z.boolean().optional(),
});

const addonQuoteSchema = z.object({
    success: z.literal(true),
    kind: z.enum(ADDON_KINDS),
    plan: z.string(),
    quantity_from: z.number(),
    quantity_to: z.number(),
    unit_price_iqd: z.number(),
    monthly_iqd: z.number(),
    charge_now_iqd: z.number(),
    balance_iqd: z.number(),
    balance_ok: z.boolean(),
    applied: z.boolean().optional(),
});

export const planChangeResultSchema = z.discriminatedUnion("success", [planQuoteSchema, refusalSchema]);
export const addonChangeResultSchema = z.discriminatedUnion("success", [addonQuoteSchema, refusalSchema]);

export type PlanQuote = z.infer<typeof planQuoteSchema>;
export type AddonQuote = z.infer<typeof addonQuoteSchema>;
export type BillingRefusal = z.infer<typeof refusalSchema>;
export type PlanChangeResult = z.infer<typeof planChangeResultSchema>;
export type AddonChangeResult = z.infer<typeof addonChangeResultSchema>;

/** What the shop bought, by kind (0 when nothing). */
export function useTenantAddons() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["tenant_addons", tenantId],
        queryFn: async () => {
            if (!tenantId) throw new Error("no store");
            const { data, error } = await supabase
                .from("tenant_addons")
                .select("kind, quantity")
                .eq("tenant_id", tenantId);
            if (error) throw error;
            const rows = z.array(z.object({ kind: z.string(), quantity: z.number() })).parse(data ?? []);
            const out: Record<AddonKind, number> = { extra_member: 0, pos_branch: 0 };
            for (const row of rows) {
                if ((ADDON_KINDS as readonly string[]).includes(row.kind)) out[row.kind as AddonKind] = row.quantity;
            }
            return out;
        },
        enabled: !!tenantId,
    });
}

export function usePlanQuote(plan: string | null) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["plan_change_quote", tenantId, plan],
        queryFn: async () => {
            if (!tenantId || !plan) throw new Error("no store or plan");
            const { data, error } = await supabase.rpc("change_plan", { p_tenant_id: tenantId, p_plan: plan, p_apply: false });
            if (error) throw error;
            return planChangeResultSchema.parse(data);
        },
        enabled: !!tenantId && !!plan,
        staleTime: 0,
        gcTime: 0,
    });
}

export function useAddonQuote(kind: AddonKind | null, quantity: number | null) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["addon_change_quote", tenantId, kind, quantity],
        queryFn: async () => {
            if (!tenantId || !kind || quantity === null) throw new Error("no store or add-on");
            const { data, error } = await supabase.rpc("set_addon_quantity", {
                p_tenant_id: tenantId,
                p_kind: kind,
                p_quantity: quantity,
                p_apply: false,
            });
            if (error) throw error;
            return addonChangeResultSchema.parse(data);
        },
        enabled: !!tenantId && !!kind && quantity !== null,
        staleTime: 0,
        gcTime: 0,
    });
}

/** Everything a plan or add-on change touches on screen. */
function useRefreshBilling() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return () => {
        for (const key of ["subscription", "wallet", "wallet_transactions", "tenant_addons", "tenant"]) {
            void qc.invalidateQueries({ queryKey: [key, tenantId] });
        }
        void qc.invalidateQueries({ queryKey: billingLockKey(tenantId) });
    };
}

export function useApplyPlanChange() {
    const { tenantId } = useAuth();
    const refresh = useRefreshBilling();
    return useMutation({
        mutationFn: async (plan: string) => {
            if (!tenantId) throw new Error("no store");
            const { data, error } = await supabase.rpc("change_plan", { p_tenant_id: tenantId, p_plan: plan, p_apply: true });
            if (error) throw error;
            return planChangeResultSchema.parse(data);
        },
        onSuccess: refresh,
    });
}

export function useApplyAddonChange() {
    const { tenantId } = useAuth();
    const refresh = useRefreshBilling();
    return useMutation({
        mutationFn: async ({ kind, quantity }: { kind: AddonKind; quantity: number }) => {
            if (!tenantId) throw new Error("no store");
            const { data, error } = await supabase.rpc("set_addon_quantity", {
                p_tenant_id: tenantId,
                p_kind: kind,
                p_quantity: quantity,
                p_apply: true,
            });
            if (error) throw error;
            return addonChangeResultSchema.parse(data);
        },
        onSuccess: refresh,
    });
}
