"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { buildStorefrontUrl } from "@/lib/storefront-url";

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

    return buildStorefrontUrl({
        slug,
        customDomain,
        rootDomain: env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN,
        hostname:
            typeof window === "undefined" ? null : window.location.host,
    });
}
