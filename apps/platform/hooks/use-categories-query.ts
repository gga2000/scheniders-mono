"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Category } from "@/types/product";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";

export const categoryKeys = {
    all: ["categories"] as const,
    lists: () => [...categoryKeys.all, "list"] as const,
};

async function fetchCategories(): Promise<Category[]> {
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

    if (error) throw error;
    return (data || []) as Category[];
}

export function useCategoriesQuery() {
    const { session, clientReady } = useAuth();

    return useQuery({
        queryKey: categoryKeys.lists(),
        queryFn: fetchCategories,
        enabled: !!session && clientReady,
        staleTime: CACHE_PRESETS.STANDARD.staleTime * 2,
        gcTime: CACHE_PRESETS.STANDARD.gcTime * 2,
    });
}

export function useAddCategoryMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (data: Omit<Category, "id" | "tenant_id" | "created_at" | "updated_at">) => {
            const { data: newCategory, error } = await supabase
                .from("categories")
                .insert([{ ...data, tenant_id: tenantId }])
                .select()
                .single();
            if (error) throw error;
            return newCategory as Category;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
        },
    });
}

export function useUpdateCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<Category> }) => {
            const { error } = await supabase
                .from("categories")
                .update(data)
                .eq("id", id);
            if (error) throw error;
            return { id, data };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
        },
    });
}

export function useDeleteCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("categories")
                .delete()
                .eq("id", id);
            if (error) throw error;
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
        },
    });
}
