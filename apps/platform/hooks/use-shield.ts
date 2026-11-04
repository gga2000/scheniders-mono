"use client";

import { useQuery } from "@tanstack/react-query";
import { loadShield, normalizeShieldPhone } from "@/lib/shield/lookup";

/** Shield network record for a customer phone (null = no network data). */
export function useShield(phone: string | null | undefined, enabled = true) {
    const norm = normalizeShieldPhone(phone);
    return useQuery({
        queryKey: ["shield", norm],
        enabled: enabled && norm !== null,
        staleTime: 5 * 60 * 1000,
        retry: false,
        queryFn: () => (norm ? loadShield(norm) : Promise.resolve(null)),
    });
}
