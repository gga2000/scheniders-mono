"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CUSTOM_TEMPLATE_PURPOSES, type CustomTemplatePurpose } from "@scheniders/shared/whatsapp-custom-templates";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * A shop's own paid wording for Fermi's automatic order messages
 * (migration 20261126133000_custom_whatsapp_templates). The database decides
 * the price, checks the text again, charges the wallet and refunds it; this
 * reads its answers and sends the shop's asks.
 */

/** Where the shop manages it, and where its bell lines lead. */
export const CUSTOM_WHATSAPP_SETTINGS_PATH = "/settings?section=orders";

const customTemplateSchema = z.object({
    id: z.string(),
    purpose: z.enum(["confirmation", "reminder", "discount"]),
    body: z.string(),
    template_name: z.string(),
    status: z.enum(["review", "at_meta", "live", "rejected", "declined", "withdrawn", "replaced"]),
    category: z.enum(["utility", "marketing"]).nullable(),
    in_use: z.boolean(),
    price_iqd: z.number(),
    reason: z.string().nullable(),
    created_at: z.string(),
    sent_to_meta_at: z.string().nullable(),
    decided_at: z.string().nullable(),
    refunded_at: z.string().nullable(),
});
export type CustomTemplate = z.infer<typeof customTemplateSchema>;
export type CustomTemplateStatus = CustomTemplate["status"];

const listSchema = z.object({
    price_iqd: z.number(),
    items: z.array(customTemplateSchema),
});

/** What one message slot shows: its approved wording, an open request, and the last one that ended. */
export interface CustomTemplateSlot {
    live: CustomTemplate | null;
    open: CustomTemplate | null;
    ended: CustomTemplate | null;
}

const OPEN: readonly CustomTemplateStatus[] = ["review", "at_meta"];
const ENDED: readonly CustomTemplateStatus[] = ["rejected", "declined", "withdrawn"];

function slotsOf(items: readonly CustomTemplate[]): Record<CustomTemplatePurpose, CustomTemplateSlot> {
    const slots = Object.fromEntries(
        CUSTOM_TEMPLATE_PURPOSES.map((p) => [p, { live: null, open: null, ended: null }]),
    ) as Record<CustomTemplatePurpose, CustomTemplateSlot>;
    // Items come newest first, so the first match of each kind is the latest.
    for (const item of items) {
        const slot = slots[item.purpose];
        if (item.status === "live") slot.live ??= item;
        else if (OPEN.includes(item.status)) slot.open ??= item;
        else if (ENDED.includes(item.status)) slot.ended ??= item;
    }
    return slots;
}

export function customTemplatesKey(tenantId: string | null | undefined) {
    return ["custom_whatsapp_templates", tenantId] as const;
}

export function useCustomWhatsappTemplates() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: customTemplatesKey(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("custom_whatsapp_templates", { p_tenant_id: tenantId as string });
            if (error) throw error;
            const list = listSchema.parse(data);
            return { priceIqd: list.price_iqd, slots: slotsOf(list.items) };
        },
    });
}

/** Why the database refused an ask (custom_template:<code>), or "other". */
export type CustomTemplateRefusal =
    | "empty"
    | "too_long"
    | "unknown_field"
    | "no_store_name"
    | "link"
    | "field_at_edge"
    | "in_flight"
    | "wallet_short"
    | "demo"
    | "other";

const REFUSALS: readonly CustomTemplateRefusal[] = [
    "empty",
    "too_long",
    "unknown_field",
    "no_store_name",
    "link",
    "field_at_edge",
    "in_flight",
    "wallet_short",
    "demo",
];

export function customTemplateRefusal(error: unknown): CustomTemplateRefusal {
    const message =
        typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
    const code = /custom_template:([a-z_]+)/.exec(message)?.[1];
    return REFUSALS.find((r) => r === code) ?? "other";
}

function useRefreshAfterMoney() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return () => {
        void qc.invalidateQueries({ queryKey: customTemplatesKey(tenantId) });
        void qc.invalidateQueries({ queryKey: ["wallet", tenantId] });
        void qc.invalidateQueries({ queryKey: ["wallet_transactions", tenantId] });
    };
}

/** Pay for the shop's own wording of one message and send it to our team. */
export function useRequestCustomTemplate() {
    const { tenantId } = useAuth();
    const refresh = useRefreshAfterMoney();
    return useMutation({
        mutationFn: async ({ purpose, body }: { purpose: CustomTemplatePurpose; body: string }) => {
            if (!tenantId) throw new Error("no store");
            const { data, error } = await supabase.rpc("request_custom_whatsapp_template", {
                p_tenant_id: tenantId,
                p_purpose: purpose,
                p_body: body,
            });
            if (error) throw error;
            return customTemplateSchema.parse(data);
        },
        onSettled: refresh,
    });
}

/** Take back a request our team has not sent to Meta yet; the money comes back. */
export function useWithdrawCustomTemplate() {
    const refresh = useRefreshAfterMoney();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.rpc("withdraw_custom_whatsapp_template", { p_id: id });
            if (error) throw error;
            return customTemplateSchema.parse(data);
        },
        onSettled: refresh,
    });
}

/** Switch between the shop's approved wording and Fermi's own. */
export function useSwitchCustomTemplate() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ id, use }: { id: string; use: boolean }) => {
            const { data, error } = await supabase.rpc("use_custom_whatsapp_template", { p_id: id, p_use: use });
            if (error) throw error;
            return customTemplateSchema.parse(data);
        },
        onSettled: () => qc.invalidateQueries({ queryKey: customTemplatesKey(tenantId) }),
    });
}
