"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";

const rowSchema = z.object({ phone: z.string(), trust: z.number().int() });

/**
 * Every customer of the active store whose Shield Trust score is under 80, as
 * phone → score, for the orders page's danger level (lib/shield/danger.ts).
 * Computed in the database for the active store only (shield_customer_trust).
 *
 * `closedCount` is how many loaded orders are finished (delivered, rejected,
 * cancelled...). Trust only moves when an order finishes, so a change in that
 * number refetches at once instead of waiting for the 10-minute refresh.
 */
export function useShieldDanger(closedCount: number) {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: ["shield", "customer-trust", tenantId, closedCount],
        placeholderData: keepPreviousData,
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
        refetchInterval: 10 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_customer_trust");
            if (error) {
                Sentry.captureException(error, { tags: { area: "orders", op: "shield.customer-trust" } });
                throw error;
            }
            return z.array(rowSchema).parse(data ?? []);
        },
    });

    const trustByPhone = useMemo(
        () => new Map((query.data ?? []).map((r) => [r.phone, r.trust])) as ReadonlyMap<string, number>,
        [query.data],
    );
        return {
        trustByPhone,
        ready: query.data !== undefined,
        /** The scores never loaded (the RPC failed); the slider offers a retry. */
        failed: query.data === undefined && query.isError,
        retry: () => void query.refetch(),
    };
}
