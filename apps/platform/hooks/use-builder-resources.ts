"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOptionalAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";

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
    products: ["builder-resources", "products"] as const,
    categories: ["builder-resources", "categories"] as const,
};

/**
 * Products as the section pickers need them — enough to recognise one in a
 * list, and nothing else. Deliberately not `useProductsCrud`, which pulls
 * the full inventory shape for a picker that shows a thumbnail and a name.
 *
 * Hidden products are fetched but marked, because a section may legitimately
 * still reference one; the picker says so instead of showing a blank row.
 */
async function fetchProducts(): Promise<BuilderProduct[]> {
    const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, image_url, price, is_visible")
        .eq("is_archived", false)
        .not("is_supply", "is", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BuilderProduct[];
}

async function fetchCategories(): Promise<BuilderCategory[]> {
    const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BuilderCategory[];
}

export function useBuilderProducts() {
    // Optional auth: a picker with nothing to offer is a usable empty state,
    // whereas throwing would blank the whole section editor.
    const auth = useOptionalAuth();
    const { session, clientReady } = auth ?? { session: null, clientReady: false };
    return useQuery({
        queryKey: builderResourceKeys.products,
        queryFn: fetchProducts,
        enabled: !!session && clientReady,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

export function useBuilderCategories() {
    const auth = useOptionalAuth();
    const { session, clientReady } = auth ?? { session: null, clientReady: false };
    return useQuery({
        queryKey: builderResourceKeys.categories,
        queryFn: fetchCategories,
        enabled: !!session && clientReady,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}
