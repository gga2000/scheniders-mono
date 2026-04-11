"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";

export function useStorefrontUrl(slug: string, tenantId: string | null): string {
    const { data: customDomain } = useQuery({
        queryKey: ["tenant-domain", tenantId],
        queryFn: async () => {
            if (!tenantId) return null;
            const { data } = await supabase
                .from("tenant_domains")
                .select("domain, verified")
                .eq("tenant_id", tenantId)
                .eq("verified", true)
                .limit(1)
                .maybeSingle();
            return data?.domain ?? null;
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 10,
    });

    const rootDomain = env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;

    if (customDomain) {
        return `https://${customDomain}`;
    }

    if (rootDomain && !rootDomain.includes("localhost")) {
        return `https://${slug}.${rootDomain}`;
    }

    const protocol = rootDomain?.includes("localhost") ? "http" : "https";
    return `${protocol}://${rootDomain}/s/${slug}`;
}
