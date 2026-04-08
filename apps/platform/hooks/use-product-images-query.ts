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
};

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
