"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { authedFetch } from "@/lib/authed-fetch";

/** Thrown when the store already has 5 unfinished Qi payments this hour. */
export class QiTooManyOpenError extends Error {
    constructor() {
        super("too_many_open");
        this.name = "QiTooManyOpenError";
    }
}

const enabledSchema = z.object({ enabled: z.boolean() });
const openedSchema = z.object({ id: z.string().uuid(), formUrl: z.string().url() });
const checkSchema = z.object({ status: z.enum(["created", "success", "failed", "canceled"]), amount: z.number() });
export type QiPaymentCheck = z.infer<typeof checkSchema>;

/** Wallet top-up by Qi card: open a payment on Qi's page, then check it on return. */
export function useQiTopup() {
    const enabled = useQuery({
        queryKey: ["qi_topup_enabled"],
        queryFn: async () => {
            const res = await authedFetch("/api/billing/qi");
            if (!res.ok) throw new Error(`qi_enabled_${res.status}`);
            return enabledSchema.parse(await res.json()).enabled;
        },
        staleTime: 10 * 60_000,
    });

    /** Opens the payment and sends the browser to Qi's page. */
    const pay = useMutation({
        mutationFn: async (input: { amount: number; locale: "ar" | "en" }) => {
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

    return { enabled: enabled.data === true, pay };
}

/** Asks the server to read the payment's status from Qi (and credit it if paid). */
export async function checkQiPayment(id: string): Promise<QiPaymentCheck> {
    const res = await authedFetch(`/api/billing/qi/${encodeURIComponent(id)}`, { method: "POST" });
    if (!res.ok) throw new Error(`qi_check_${res.status}`);
    return checkSchema.parse(await res.json());
}
