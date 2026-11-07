"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { buildStorefrontUrl, pickPrimaryDomain } from "@/lib/storefront-url";

export function useStorefrontUrl(slug: string, tenantId: string | null): string {
    return useStorefrontUrlState(slug, tenantId).url;
}

/**
 * The storefront URL plus whether the custom-domain lookup has settled.
 * Until it settles the URL is the slug subdomain, which may not exist for a
 * store on its own domain; a caller that loads it in an iframe (and trusts
 * its origin for postMessage) should wait for `resolved`.
 */
export function useStorefrontUrlState(
    slug: string,
    tenantId: string | null,
): { url: string; resolved: boolean } {
    const { data: customDomain, isSuccess, isError } = useQuery({
        queryKey: ["tenant-domain", tenantId],
        queryFn: async () => {
            if (!tenantId) return null;
            const { data, error } = await supabase
                .from("tenant_domains")
                .select("domain, created_at")
                .eq("tenant_id", tenantId)
                .eq("verified", true);
            if (error) throw error;
            return pickPrimaryDomain(data ?? []);
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 10,
    });

    const url = buildStorefrontUrl({
        slug,
        customDomain,
        rootDomain: env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN,
        hostname:
            typeof window === "undefined" ? null : window.location.host,
    });
    return { url, resolved: !tenantId || isSuccess || isError };
}
