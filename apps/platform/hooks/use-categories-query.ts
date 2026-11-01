"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryStatus } from "@/types/product";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { ProductWriteDeniedError } from "@/lib/repositories/product-repository";
import { fetchAllPages } from "@/lib/repositories/fetch-all-pages";

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
            const { data: newCategory, error } = await supabase
                .from("categories")
                .insert([{ ...data, tenant_id: tenantId! } as never])
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
                .update(data as never)
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
                } as never)
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
                } as never)
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
    const { tenantId } = useAuth();
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
                .select("*")
                .eq("id", id)
                .single();
            if (fetchErr) throw fetchErr;

            const source = src as unknown as Category;
            const copy = {
                ...source,
                id: undefined,
                tenant_id: tenantId!,
                name: `${source.name} ${copySuffix}`,
                slug: `${source.slug}-copy-${Date.now().toString(36)}`,
                created_at: undefined,
                updated_at: undefined,
            };
            delete (copy as Partial<Category>).id;
            delete (copy as Partial<Category>).created_at;
            delete (copy as Partial<Category>).updated_at;

            const { data: inserted, error: insErr } = await supabase
                .from("categories")
                .insert([copy as never])
                .select()
                .single();
            if (insErr) throw insErr;
            const newCategory = inserted as unknown as Category;

            if (withProducts) {
                try {
                    // Paged: the API silently stops at 1000 rows.
                    const assignments = await fetchAllPages<{
                        product_id: string;
                        is_featured: boolean | null;
                        featured_order: number | null;
                    }>((from, to) =>
                        supabase
                            .from("product_categories")
                            .select("product_id, is_featured, featured_order")
                            .eq("tenant_id", tenantId!)
                            .eq("category_id", id)
                            .order("product_id")
                            .range(from, to),
                    );
                    if (assignments.length > 0) {
                        const rows = assignments.map((a) => ({
                            tenant_id: tenantId!,
                            category_id: newCategory.id,
                            product_id: a.product_id,
                            is_primary: false,
                            is_featured: a.is_featured,
                            featured_order: a.featured_order,
                            source: "manual" as const,
                        }));
                        const { error: copyErr } = await supabase.from("product_categories").insert(rows as never);
                        if (copyErr) throw copyErr;
                    }
                } catch (copyFailure) {
                    // Do not leave an empty copy behind.
                    await supabase.from("categories").delete().eq("id", newCategory.id);
                    throw copyFailure;
                }
            }
            return newCategory;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoryKeys.all });
        },
    });
}
