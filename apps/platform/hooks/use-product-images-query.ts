"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";

export interface ProductImage {
    id: string;
    product_id: string;
    tenant_id: string;
    image_url: string;
    alt_text: string | null;
    display_order: number;
    created_at: string;
}

export const productImageKeys = {
    all: ["product_images"] as const,
    lists: () => [...productImageKeys.all, "list"] as const,
    list: (productId: string) => [...productImageKeys.lists(), productId] as const,
    galleryUrls: (productId: string) => [...productImageKeys.all, "gallery_urls", productId] as const,
};

/** products.gallery_urls is jsonb — coerce defensively to a clean array of
 *  non-empty strings (anything else becomes an empty gallery). */
export function coerceGalleryUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
}

/** The import-time gallery on the product row itself (products.gallery_urls),
 *  distinct from the merchant-managed product_images rows above. */
export function useProductGalleryUrlsQuery(productId?: string) {
    const { session, clientReady } = useAuth();

    return useQuery({
        queryKey: productImageKeys.galleryUrls(productId as string),
        queryFn: async () => {
            if (!productId) return [];
            const { data, error } = await supabase
                .from("products")
                .select("gallery_urls")
                .eq("id", productId)
                .single();

            if (error) throw error;
            return coerceGalleryUrls((data as { gallery_urls?: unknown } | null)?.gallery_urls);
        },
        enabled: !!session && clientReady && !!productId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

/** Remove one URL from products.gallery_urls (read-modify-write on the live
 *  row so a stale cache can't resurrect a removed photo). Tenant scoping is
 *  enforced by the products RLS update policy. */
export function useRemoveProductGalleryUrlMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ productId, url }: { productId: string; url: string }) => {
            const { data: row, error: getError } = await supabase
                .from("products")
                .select("gallery_urls")
                .eq("id", productId)
                .single();

            if (getError) throw getError;

            const next = coerceGalleryUrls(
                (row as { gallery_urls?: unknown } | null)?.gallery_urls,
            ).filter((u) => u !== url);

            const { error } = await supabase
                .from("products")
                .update({ gallery_urls: next })
                .eq("id", productId);

            if (error) throw error;
            return { productId, gallery_urls: next };
        },
        onSuccess: (data) => {
            queryClient.setQueryData(
                productImageKeys.galleryUrls(data.productId),
                data.gallery_urls,
            );
        },
    });
}

export function useProductImagesQuery(productId?: string) {
    const { session, clientReady } = useAuth();

    return useQuery({
        queryKey: productImageKeys.list(productId as string),
        queryFn: async () => {
            if (!productId) return [];
            const { data, error } = await supabase
                .from("product_images")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return (data || []) as ProductImage[];
        },
        enabled: !!session && clientReady && !!productId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

export function useAddProductImageMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();

    return useMutation({
        mutationFn: async (data: Omit<ProductImage, "id" | "tenant_id" | "created_at">) => {
            const { data: newImage, error } = await supabase
                .from("product_images")
                .insert([{ ...data, tenant_id: tenantId }])
                .select()
                .single();

            if (error) throw error;
            return newImage as ProductImage;
        },
        onSuccess: (_, variables) => {
            if (variables.product_id) {
                queryClient.invalidateQueries({ queryKey: productImageKeys.list(variables.product_id) });
            }
        },
    });
}

export function useUpdateProductImageMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<ProductImage> }) => {
            const { data: updated, error } = await supabase
                .from("product_images")
                .update(data)
                .eq("id", id)
                .select("product_id")
                .single();

            if (error) throw error;
            return { id, product_id: updated.product_id };
        },
        onSuccess: (data) => {
            if (data.product_id) {
                queryClient.invalidateQueries({ queryKey: productImageKeys.list(data.product_id) });
            }
        },
    });
}

export function useDeleteProductImageMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, imageUrl }: { id: string; imageUrl: string }) => {
            const { data: img, error: getError } = await supabase
                .from("product_images")
                .select("product_id")
                .eq("id", id)
                .single();

            if (getError) throw getError;

            try {
                const urlObj = new URL(imageUrl);
                const pathParts = urlObj.pathname.split("/product-images/");
                if (pathParts.length > 1) {
                    const filePath = pathParts[1];
                    await supabase.storage.from("product-images").remove([filePath]);
                }
            } catch (e) {
                console.error("Storage delete error", e);
            }

            const { error: dbError } = await supabase
                .from("product_images")
                .delete()
                .eq("id", id);
                
            if (dbError) throw dbError;
            
            return { id, product_id: img.product_id };
        },
        onSuccess: (data) => {
            if (data.product_id) {
                queryClient.invalidateQueries({ queryKey: productImageKeys.list(data.product_id) });
            }
        },
    });
}

export function useReorderProductImagesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
         mutationFn: async ({ productId, items }: { productId: string; items: { id: string; display_order: number }[] }) => {
             await Promise.all(
                 items.map((item) =>
                     supabase
                         .from("product_images")
                         .update({ display_order: item.display_order })
                         .eq("id", item.id)
                 )
             );
             return { productId };
         },
         onSuccess: (data) => {
             queryClient.invalidateQueries({ queryKey: productImageKeys.list(data.productId) });
         },
    });
}
