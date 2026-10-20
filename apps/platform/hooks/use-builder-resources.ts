"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOptionalAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { attributeKeys, fetchAttributeDefs } from "@/hooks/use-product-attributes-query";

export interface BuilderProduct {
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
    price: number | null;
    is_visible: boolean | null;
}

export interface BuilderCategory {
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
}

export const builderResourceKeys = {
    products: (tenantId: string | null) => ["builder-resources", "products", tenantId] as const,
    categories: (tenantId: string | null) => ["builder-resources", "categories", tenantId] as const,
};

/**
 * Products as the section pickers need them — enough to recognise one in a
 * list, and nothing else. Deliberately not `useProductsCrud`, which pulls
 * the full inventory shape for a picker that shows a thumbnail and a name.
 *
 * Hidden products are fetched but marked, because a section may legitimately
 * still reference one; the picker says so instead of showing a blank row.
 */
async function fetchProducts(tenantId: string): Promise<BuilderProduct[]> {
    const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, image_url, price, is_visible")
        .eq("tenant_id", tenantId)
        .eq("is_archived", false)
        .not("is_supply", "is", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BuilderProduct[];
}

async function fetchCategories(tenantId: string): Promise<BuilderCategory[]> {
    const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .eq("tenant_id", tenantId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BuilderCategory[];
}

export function useBuilderProducts() {
    // Optional auth: a picker with nothing to offer is a usable empty state,
    // whereas throwing would blank the whole section editor.
    const auth = useOptionalAuth();
    const { session, clientReady, tenantId } = auth ?? { session: null, clientReady: false, tenantId: null };
    return useQuery({
        // Keyed and filtered by the active tenant: RLS admits every tenant the
        // user belongs to, and a picker must only offer the store being edited.
        queryKey: builderResourceKeys.products(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("builder products requested without a tenant");
            return fetchProducts(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

export function useBuilderCategories() {
    const auth = useOptionalAuth();
    const { session, clientReady, tenantId } = auth ?? { session: null, clientReady: false, tenantId: null };
    return useQuery({
        queryKey: builderResourceKeys.categories(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("builder categories requested without a tenant");
            return fetchCategories(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

/**
 * The store's product attributes, for the attribute pickers. Shares its cache
 * entry with the attributes screen, so an attribute added there shows up
 * here. Optional auth for the same reason as the hooks above.
 */
export function useBuilderAttributes() {
    const auth = useOptionalAuth();
    const { session, clientReady, tenantId } = auth ?? { session: null, clientReady: false, tenantId: null };
    return useQuery({
        queryKey: attributeKeys.defs(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("builder attributes requested without a tenant");
            return fetchAttributeDefs(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}
