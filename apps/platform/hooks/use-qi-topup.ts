"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authedFetch } from "@/lib/authed-fetch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/** Thrown when the store already has 5 unfinished Qi payments this hour. */
export class QiTooManyOpenError extends Error {
    constructor() {
        super("too_many_open");
        this.name = "QiTooManyOpenError";
    }
}

const enabledSchema = z.object({ enabled: z.boolean(), saveCard: z.boolean() });
const openedSchema = z.object({ id: z.string().uuid(), formUrl: z.string().url() });
const checkSchema = z.object({
    status: z.enum(["created", "success", "failed", "canceled"]),
    amount: z.number(),
    /** null: the shop did not ask to save the card; false: Qi gave no card we may charge alone. */
    cardSaved: z.boolean().nullable(),
});
export type QiPaymentCheck = z.infer<typeof checkSchema>;

/** Wallet top-up by Qi card: open a payment on Qi's page, then check it on return. */
export function useQiTopup() {
    const enabled = useQuery({
        queryKey: ["qi_topup_enabled"],
        queryFn: async () => {
            const res = await authedFetch("/api/billing/qi");
            if (!res.ok) throw new Error(`qi_enabled_${res.status}`);
            return enabledSchema.parse(await res.json());
        },
        staleTime: 10 * 60_000,
    });

    /** Opens the payment and sends the browser to Qi's page. */
    const pay = useMutation({
        mutationFn: async (input: { amount: number; locale: "ar" | "en"; saveCard: boolean }) => {
            const res = await authedFetch("/api/billing/qi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });
            if (res.status === 429) throw new QiTooManyOpenError();
            if (!res.ok) throw new Error(`qi_open_${res.status}`);
            const { formUrl } = openedSchema.parse(await res.json());
            window.location.assign(formUrl);
        },
    });

    return { enabled: enabled.data?.enabled === true, canSaveCard: enabled.data?.saveCard === true, pay };
}

/** Asks the server to read the payment's status from Qi (and credit it if paid). */
export async function checkQiPayment(id: string): Promise<QiPaymentCheck> {
    const res = await authedFetch(`/api/billing/qi/${encodeURIComponent(id)}`, { method: "POST" });
    if (!res.ok) throw new Error(`qi_check_${res.status}`);
    return checkSchema.parse(await res.json());
}

/** The columns a store admin may read; the token itself never leaves the server. */
const savedCardSchema = z.object({
    masked_pan: z.string().nullable(),
    payment_system: z.string().nullable(),
    valid_to: z.string().nullable(),
    auto_refill: z.boolean(),
    refill_amount_iqd: z.number(),
    refill_below_iqd: z.number(),
    failures: z.number(),
});
export type QiSavedCard = z.infer<typeof savedCardSchema>;

/** Failed charges in a row after which auto refill switches itself off (settle_qi_payment). */
export const QI_REFILL_MAX_FAILURES = 3;

/** The store's saved Qi card for auto refill, with the actions on it. */
export function useQiSavedCard() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const queryKey = ["qi_saved_card", tenantId];

    const card = useQuery({
        queryKey,
        queryFn: async () => {
            if (!tenantId) return null;
            const { data, error } = await supabase
                .from("qi_saved_cards")
                .select("masked_pan, payment_system, valid_to, auto_refill, refill_amount_iqd, refill_below_iqd, failures")
                .eq("tenant_id", tenantId)
                .maybeSingle();
            if (error) throw error;
            return data ? savedCardSchema.parse(data) : null;
        },
        enabled: !!tenantId,
    });

    const update = useMutation({
        mutationFn: async (input: { autoRefill?: boolean; refillAmount?: number }) => {
            const res = await authedFetch("/api/billing/qi/card", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });
            if (!res.ok) throw new Error(`qi_card_update_${res.status}`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey }),
    });

    const remove = useMutation({
        mutationFn: async () => {
            const res = await authedFetch("/api/billing/qi/card", { method: "DELETE" });
            if (!res.ok) throw new Error(`qi_card_remove_${res.status}`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey }),
    });

    return { card: card.data ?? null, refresh: card.refetch, update, remove };
}
