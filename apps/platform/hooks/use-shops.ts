"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import {
    DEFAULT_TILL_RULES,
    tillRulesSchema,
    type ShopFormValues,
    type TillRules,
} from "@/lib/till/shop-forms";

export interface Shop {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    receipt_footer: string | null;
    is_active: boolean;
    staff: string[]; // user ids
}

export interface TillMember {
    user_id: string;
    display_name: string;
    role: string;
    has_pin: boolean;
}

const keys = {
    shops: (tenantId: string | null) => ["till", "shops", tenantId] as const,
    rules: (tenantId: string | null) => ["till", "rules", tenantId] as const,
    members: (tenantId: string | null) => ["till", "members", tenantId] as const,
    chips: (tenantId: string | null) => ["till", "chips", tenantId] as const,
};

const chipIdsSchema = z.array(z.string().uuid()).nullable();

/** The store's shops with the people who work in each, oldest first. RLS keeps it to the caller's store. */
export function useShops() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: keys.shops(tenantId),
        enabled: !!tenantId,
        queryFn: async (): Promise<Shop[]> => {
            const [shops, staff] = await Promise.all([
                supabase
                    .from("shops")
                    .select("id, name, address, phone, receipt_footer, is_active")
                    .eq("tenant_id", tenantId)
                    .order("created_at", { ascending: true }),
                supabase.from("shop_staff").select("shop_id, user_id").eq("tenant_id", tenantId),
            ]);
            if (shops.error) throw shops.error;
            if (staff.error) throw staff.error;
            type ShopRow = Omit<Shop, "staff">;
            type StaffRow = { shop_id: string; user_id: string };
            const byShop = new Map<string, string[]>();
            for (const row of (staff.data ?? []) as StaffRow[]) {
                byShop.set(row.shop_id, [...(byShop.get(row.shop_id) ?? []), row.user_id]);
            }
            return ((shops.data ?? []) as ShopRow[]).map((s) => ({ ...s, staff: byShop.get(s.id) ?? [] }));
        },
    });
}

/** The store's till rules, or the defaults until the owner saves them once. */
export function useTillRules() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: keys.rules(tenantId),
        enabled: !!tenantId,
        queryFn: async (): Promise<TillRules> => {
            const { data, error } = await supabase
                .from("till_settings")
                .select(
                    "cashier_discount_pct, pay_later_default_limit, commission_pct, return_days, lock_after_minutes, pin_for_refunds, whatsapp_receipt_default",
                )
                .eq("tenant_id", tenantId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return DEFAULT_TILL_RULES;
            // numeric columns arrive as strings or numbers depending on the driver; read them as numbers.
            const row = data as Record<string, unknown>;
            return tillRulesSchema.parse({
                ...row,
                cashier_discount_pct: row.cashier_discount_pct === null ? null : Number(row.cashier_discount_pct),
                commission_pct: Number(row.commission_pct),
                pay_later_default_limit: Number(row.pay_later_default_limit),
            });
        },
    });
}

/** Active team members with whether each has set a till PIN. */
export function useTillMembers() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: keys.members(tenantId),
        enabled: !!tenantId,
        queryFn: async (): Promise<TillMember[]> => {
            const [members, pins] = await Promise.all([
                supabase
                    .from("tenant_members")
                    // Two FKs to user_profiles (user_id + invited_by): the embed must name the constraint.
                    .select("user_id, role, user_profiles!tenant_members_user_id_fkey(display_name)")
                    .eq("tenant_id", tenantId)
                    .eq("status", "active"),
                supabase.rpc("till_pin_status", { p_tenant_id: tenantId }),
            ]);
            if (members.error) throw members.error;
            if (pins.error) throw pins.error;
            type Profile = { display_name: string | null };
            type Row = { user_id: string; role: string; user_profiles: Profile | Profile[] | null };
            const withPin = new Set(
                ((pins.data ?? []) as { user_id: string; has_pin: boolean }[]).filter((p) => p.has_pin).map((p) => p.user_id),
            );
            return ((members.data ?? []) as unknown as Row[])
                .map((r) => {
                    const p = Array.isArray(r.user_profiles) ? r.user_profiles[0] : r.user_profiles;
                    return { user_id: r.user_id, display_name: p?.display_name?.trim() || "—", role: r.role, has_pin: withPin.has(r.user_id) };
                })
                .sort((a, b) => a.display_name.localeCompare(b.display_name));
        },
    });
}

function useInvalidate() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return (which: keyof typeof keys) => qc.invalidateQueries({ queryKey: keys[which](tenantId) });
}

/** Adds a shop, or edits one when `id` is given, and sets who works there. */
export function useSaveShop() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (input: { id?: string; values: ShopFormValues; staff: string[]; previousStaff: string[] }) => {
            if (!tenantId) throw new Error("no store");
            let shopId = input.id;
            if (shopId) {
                const { error } = await supabase.from("shops").update(input.values).eq("id", shopId).eq("tenant_id", tenantId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase
                    .from("shops")
                    .insert({ ...input.values, tenant_id: tenantId })
                    .select("id")
                    .single();
                if (error) throw error;
                shopId = (data as { id: string }).id;
            }
            const added = input.staff.filter((u) => !input.previousStaff.includes(u));
            const removed = input.previousStaff.filter((u) => !input.staff.includes(u));
            if (added.length) {
                const { error } = await supabase
                    .from("shop_staff")
                    .insert(added.map((user_id) => ({ shop_id: shopId, user_id, tenant_id: tenantId })));
                if (error) throw error;
            }
            if (removed.length) {
                const { error } = await supabase
                    .from("shop_staff")
                    .delete()
                    .eq("shop_id", shopId)
                    .eq("tenant_id", tenantId)
                    .in("user_id", removed);
                if (error) throw error;
            }
        },
        onSuccess: () => invalidate("shops"),
    });
}

/** Switches a shop off or back on. Shops are never deleted: their sales keep pointing at them. */
export function useSetShopActive() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
            const { error } = await supabase.from("shops").update({ is_active: active }).eq("id", id).eq("tenant_id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => invalidate("shops"),
    });
}

export function useSaveTillRules() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (rules: TillRules) => {
            if (!tenantId) throw new Error("no store");
            const parsed = tillRulesSchema.parse(rules);
            const { error } = await supabase.from("till_settings").upsert({ tenant_id: tenantId, ...parsed }, { onConflict: "tenant_id" });
            if (error) throw error;
        },
        onSuccess: () => invalidate("rules"),
    });
}

/**
 * Which categories show as buttons on the till, in order. null means the till
 * shows every visible category with products, in the store's own order.
 */
export function useTillChips() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: keys.chips(tenantId),
        enabled: !!tenantId,
        queryFn: async (): Promise<string[] | null> => {
            const { data, error } = await supabase.from("till_settings").select("chip_category_ids").eq("tenant_id", tenantId).maybeSingle();
            if (error) throw error;
            return chipIdsSchema.parse(data?.chip_category_ids ?? null);
        },
    });
}

export function useSaveTillChips() {
    const { tenantId } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[] | null) => {
            if (!tenantId) throw new Error("no store");
            const chip_category_ids = chipIdsSchema.parse(ids);
            const { error } = await supabase.from("till_settings").upsert({ tenant_id: tenantId, chip_category_ids }, { onConflict: "tenant_id" });
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: keys.chips(tenantId) });
            void qc.invalidateQueries({ queryKey: ["till", "overview"] });
        },
    });
}

export function useSetMyPin() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (pin: string) => {
            const { error } = await supabase.rpc("set_my_till_pin", { p_tenant_id: tenantId, p_pin: pin });
            if (error) throw error;
        },
        onSuccess: () => invalidate("members"),
    });
}

export function useClearPin() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (userId: string) => {
            const { error } = await supabase.rpc("clear_till_pin", { p_tenant_id: tenantId, p_user_id: userId });
            if (error) throw error;
        },
        onSuccess: () => invalidate("members"),
    });
}
