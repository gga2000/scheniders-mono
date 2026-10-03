import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface TenantBrand {
    name: string | null;
    logoUrl: string | null;
}

const EMPTY: TenantBrand = { name: null, logoUrl: null };

/**
 * The store's name and logo, for branding the workspace channel.
 *
 * Two sources, in order: `branding.logo_url` is the account-level field, and
 * `store_config_v2.brand_kit.identity.logo_url` is what the store builder
 * actually writes — so a merchant who has only ever set their logo in the
 * builder (the common case) still gets it here.
 *
 * Tenant scoping is the `tenants` RLS SELECT policy; the query keys on tenantId
 * so the cache stays per-tenant.
 */
export function useTenantBrand(): TenantBrand {
    const { user, tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: ["chat", "tenant-brand", tenantId],
        enabled: !!user?.id && !!tenantId,
        // Branding changes about once a quarter; don't re-fetch it on every open.
        staleTime: 10 * 60_000,
        queryFn: async (): Promise<TenantBrand> => {
            const { data, error } = await supabase
                .from("tenants")
                .select("business_name, branding, store_config_v2")
                .eq("id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            if (!data) return EMPTY;

            const branding = data.branding as { logo_url?: string | null } | null;
            const config = data.store_config_v2 as
                | { brand_kit?: { identity?: { logo_url?: string | null } } }
                | null;

            return {
                name: data.business_name ?? null,
                logoUrl: branding?.logo_url ?? config?.brand_kit?.identity?.logo_url ?? null,
            };
        },
    });
    return data ?? EMPTY;
}
