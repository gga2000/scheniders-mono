"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** The name of the store a signed-in person works in, for "signed in to …" lines on the auth pages. */
export function useStoreName(tenantId: string | null) {
    return useQuery<string | null>({
        queryKey: ["auth-store-name", tenantId],
        enabled: tenantId !== null,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            if (tenantId === null) return null;
            const { data, error } = await supabase.from("tenants").select("business_name").eq("id", tenantId).maybeSingle();
            if (error) throw error;
            return data?.business_name ?? null;
        },
    });
}
