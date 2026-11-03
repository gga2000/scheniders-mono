"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryStatus } from "@/types/product";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { ProductWriteDeniedError } from "@/lib/repositories/product-repository";

export const categoryKeys = {
    all: ["categories"] as const,
    lists: () => [...categoryKeys.all, "list"] as const,
    list: (filters: CategoriesFilters) =>
        [...categoryKeys.lists(), filters] as const,
};

export interface CategoriesFilters {
    includeArchived?: boolean;
    statuses?: CategoryStatus[];
}

async function fetchCategories(tenantId: string, filters: CategoriesFilters = {}): Promise<Category[]> {
    let query = supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

    if (filters.statuses && filters.statuses.length > 0) {
        query = query.in("status", filters.statuses);
    } else if (!filters.includeArchived) {
        query = query.neq("status", "archived");
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as Category[];
}

export function useCategoriesQuery(filters: CategoriesFilters = {}) {
    const { session, clientReady, tenantId } = useAuth();

    return useQuery({
        queryKey: [...categoryKeys.list(filters), tenantId] as const,
        queryFn: () => (tenantId ? fetchCategories(tenantId, filters) : Promise.resolve([])),
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime * 2,
        gcTime: CACHE_PRESETS.STANDARD.gcTime * 2,
    });
}

export interface CategoryMembership {
    category_id: string;
    product_id: string;
}

const MEMBERSHIP_PAGE = 1000;

/**
 * Curated collection members (product_categories). The storefront lists these
 * on a category page alongside products whose category_id points at it, so
 * counts and delete checks must include them.
 */
async function fetchCategoryMemberships(tenantId: string): Promise<CategoryMembership[]> {
    const rows: CategoryMembership[] = [];
    for (let from = 0; ; from += MEMBERSHIP_PAGE) {
        const { data, error } = await supabase
            .from("product_categories")
            .select("category_id, product_id")
            .eq("tenant_id", tenantId)
            .order("category_id")
            .order("product_id")
            .range(from, from + MEMBERSHIP_PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as CategoryMembership[]));
        if (!data || data.length < MEMBERSHIP_PAGE) return rows;
    }
}

export function useCategoryMembershipsQuery() {
    const { session, clientReady, tenantId } = useAuth();
    return useQuery({
        queryKey: [...categoryKeys.all, "memberships", tenantId] as const,
        queryFn: () => (tenantId ? fetchCategoryMemberships(tenantId) : Promise.resolve([])),
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
    });
}

export function useAddCategoryMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (
            data: Partial<Omit<Category, "id" | "tenant_id" | "created_at" | "updated_at">> &
                Pick<Category, "name" | "slug">,
        ) => {
            if (!tenantId) throw new ProductWriteDeniedError("add category");
            const { data: newCategory, error } = await supabase
                .from("categories")
                .insert([{ ...data, tenant_id: tenantId }])
                .select()
                .single();
            if (error) throw error;
            return newCategory as unknown as Category;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

export function useUpdateCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<Category> }) => {
            const { data: changed, error } = await supabase
                .from("categories")
                .update(data)
                .eq("id", id)
                .select("id");
            if (error) throw error;
            // RLS refuses an update by matching no rows, not with an error.
            if (!changed || changed.length === 0) throw new ProductWriteDeniedError("update category");
            return { id, data };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

/** What a bulk change may set on many categories at once. */
export type CategoryBulkPatch =
    | { status: "archived"; archived_at: string }
    | { status: "published"; archived_at: null }
    | { show_in_main_nav: boolean };

/**
 * One write for many categories. RLS drops the rows the member may not change,
 * so the result lists the ids that did change and the caller treats the rest
 * as failed.
 */
export function useBulkUpdateCategoriesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, patch }: { ids: string[]; patch: CategoryBulkPatch }): Promise<string[]> => {
            if (ids.length === 0) return [];
            const { data, error } = await supabase
                .from("categories")
                .update(patch)
                .in("id", ids)
                .select("id");
            if (error) throw error;
            return (data ?? []).map((row) => row.id);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

export function useDeleteCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase
                .from("categories")
                .delete()
                .eq("id", id)
                .select("id");
            if (error) throw error;
            // RLS refuses a delete by matching no rows, not with an error.
            if (!data || data.length === 0) throw new ProductWriteDeniedError("delete category");
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

// Soft-delete: marks the category as archived with a timestamp so it can be restored
// within the 30-day grace window handled by a nightly purge job.
export function useArchiveCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data: changed, error } = await supabase
                .from("categories")
                .update({
                    status: "archived",
                    archived_at: new Date().toISOString(),
                })
                .eq("id", id)
                .select("id");
            if (error) throw error;
            if (!changed || changed.length === 0) throw new ProductWriteDeniedError("archive category");
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

export function useRestoreCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data: changed, error } = await supabase
                .from("categories")
                .update({
                    status: "published",
                    archived_at: null,
                })
                .eq("id", id)
                .select("id");
            if (error) throw error;
            if (!changed || changed.length === 0) throw new ProductWriteDeniedError("restore category");
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

export interface ReorderEntry {
    id: string;
    parent_id: string | null;
    display_order: number;
}

// One database call: the whole move applies or none of it does, and the database
// refuses a category moved under its own descendant or under another store's parent.
export function useReorderCategoriesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (entries: ReorderEntry[]) => {
            if (entries.length === 0) return [] as string[];
            const { error } = await supabase.rpc("reorder_categories", { p_entries: entries });
            if (error?.code === "42501") throw new ProductWriteDeniedError("reorder categories");
            if (error) throw error;
            return entries.map((e) => e.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}

export function useDuplicateCategoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            withProducts,
            copySuffix,
        }: {
            id: string;
            withProducts: boolean;
            /** Appended to the name, in the merchant's language. */
            copySuffix: string;
        }) => {
            const { data: src, error: fetchErr } = await supabase
                .from("categories")
                .select("name, slug")
                .eq("id", id)
                .single();
            if (fetchErr) throw fetchErr;

            // One transaction: the copy and its product links land together or
            // not at all, so a failure never leaves an empty "… copy" behind.
            const { data: newId, error: dupErr } = await supabase.rpc("duplicate_category", {
                p_id: id,
                p_name: `${src.name} ${copySuffix}`,
                p_slug: `${src.slug}-copy-${Date.now().toString(36)}`,
                p_with_products: withProducts,
            });
            if (dupErr) throw dupErr;

            const { data: inserted, error: readErr } = await supabase
                .from("categories")
                .select("*")
                .eq("id", newId as string)
                .single();
            if (readErr) throw readErr;
            return inserted as unknown as Category;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}
