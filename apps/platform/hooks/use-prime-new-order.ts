"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { authedFetch } from "@/lib/authed-fetch";

const districtsAnswer = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({
        success: z.literal(true),
        connected: z.literal(true),
        state: z.string().nullable(),
        districts: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
]);

const quoteAnswer = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({ success: z.literal(true), connected: z.literal(true), state: z.string().nullable(), fee: z.number().nullable() }),
]);

export type PrimeDistrictsAnswer = z.infer<typeof districtsAnswer>;

/** Prime's districts for the governorate on the new-order form (GET /api/prime/districts). Off without the Prime link. */
export function usePrimeDistricts(city: string, enabled: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ["prime-districts", tenantId, city],
        enabled: enabled && !!token && city.trim() !== "",
        staleTime: 60 * 60_000,
        retry: 1,
        queryFn: async (): Promise<PrimeDistrictsAnswer> => {
            const res = await authedFetch(`/api/prime/districts?${new URLSearchParams({ city })}`, { });
            if (!res.ok) throw new Error(`Prime districts failed: ${res.status}`);
            return districtsAnswer.parse(await res.json());
        },
    });
}

/**
 * Prime's fee for the parcel being typed (POST /api/prime/quote): its
 * governorate, district and the amount Prime collects. Keeps the last fee on
 * screen while a new amount is checked.
 */
export function usePrimeQuote(input: { city: string; districtId: number | null; amount: number }, enabled: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const { city, districtId, amount } = input;
    return useQuery({
        queryKey: ["prime-quote", tenantId, city, districtId, amount],
        enabled: enabled && !!token && city.trim() !== "" && amount >= 0,
        staleTime: 30 * 60_000,
        retry: 1,
        placeholderData: (previous) => previous,
        queryFn: async () => {
            const res = await authedFetch("/api/prime/quote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ city, amount, ...(districtId ? { districtId } : {}) }),
            });
            if (!res.ok) throw new Error(`Prime quote failed: ${res.status}`);
            return quoteAnswer.parse(await res.json());
        },
    });
}
