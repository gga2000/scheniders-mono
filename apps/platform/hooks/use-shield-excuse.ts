"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { normalizeShieldPhone } from "@/lib/shield/lookup";

const rowSchema = z.object({
    id: z.string(),
    sequence_number: z.number().int().nullable(),
    created_at: z.string(),
    status: z.string(),
    reason: z.string().nullable(),
    points: z.number().int(),
    excused: z.boolean(),
});

export type ShieldOwnBadOrder = z.infer<typeof rowSchema>;

/**
 * This store's cancelled / rejected / no-answer orders for one customer that
 * cost Trust points, with the "our fault" mark (shield_own_bad_orders).
 */
export function useShieldOwnBadOrders(phone: string | null | undefined, enabled: boolean) {
    const norm = normalizeShieldPhone(phone);
    return useQuery({
        queryKey: ["shield", "own-bad", norm],
        enabled: enabled && norm !== null,
        staleTime: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_own_bad_orders", { p_phone: norm ?? "" });
            if (error) {
                Sentry.captureException(error, { tags: { area: "orders", op: "shield.own-bad-orders" } });
                throw error;
            }
            return z.array(rowSchema).parse(data ?? []);
        },
    });
}

/** Mark (or unmark) one closed order as the store's or courier's fault: it then costs the customer no points. */
export async function setShieldExcused(orderId: string, excused: boolean): Promise<void> {
    const { error } = await supabase.rpc("shield_set_excused", { p_order_id: orderId, p_excused: excused });
    if (error) {
        Sentry.captureException(error, { tags: { area: "orders", op: "shield.set-excused" } });
        throw error;
    }
}

/** setShieldExcused, then every Shield number (ring, report, danger levels) reloads. */
export function useSetShieldExcused() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ orderId, excused }: { orderId: string; excused: boolean }) => setShieldExcused(orderId, excused),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["shield"] }),
    });
}
