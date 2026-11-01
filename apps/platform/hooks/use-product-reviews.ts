"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { useAuth } from "@/components/auth/auth-provider";
import type { ReviewStatus } from "@scheniders/shared";

export interface AdminReview {
    id: string;
    product_id: string;
    rating: number;
    title: string | null;
    body: string | null;
    author_name: string | null;
    photo_urls: string[];
    status: ReviewStatus;
    created_at: string;
    /** Resolved from the embedded product row (null if it was deleted). */
    product_name: string | null;
}

/** All reviews for the current tenant (every status) — member RLS scopes rows. */
export function useProductReviews() {
    const { tenantId } = useAuth();
    return useQuery<AdminReview[]>({
        queryKey: ["product-reviews", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            // Counts on the tabs are totals, so read every review, not the API's first page.
            const data = await fetchAllPages<Record<string, unknown>>(async (offset) => {
                const { data: page, error, count } = await supabase
                    .from("product_reviews")
                    .select(
                        "id, product_id, rating, title, body, author_name, photo_urls, status, created_at, products(name)",
                        { count: "exact" },
                    )
                    .eq("tenant_id", tenantId!)
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .range(offset, offset + 999);
                if (error) throw error;
                return { rows: (page ?? []) as Record<string, unknown>[], total: count ?? 0 };
            });
            const rows = (data ?? []) as unknown as Array<
                Omit<AdminReview, "product_name"> & { products: { name: string } | null }
            >;
            return rows.map(({ products, ...r }) => ({
                ...r,
                product_name: products?.name ?? null,
            }));
        },
    });
}

/** Approve / reject / delete a review. RLS confines writes to the tenant. */
export function useReviewModeration() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    const invalidate = (): Promise<void> =>
        qc.invalidateQueries({ queryKey: ["product-reviews", tenantId] });

    const setStatus = useMutation({
        mutationFn: async ({
            id,
            status,
        }: {
            id: string;
            status: ReviewStatus;
        }): Promise<void> => {
            const { error } = await supabase
                .from("product_reviews")
                .update({ status })
                .eq("id", id)
                .eq("tenant_id", tenantId!);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });

    const remove = useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from("product_reviews")
                .delete()
                .eq("id", id)
                .eq("tenant_id", tenantId!);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });

    return { setStatus, remove };
}
