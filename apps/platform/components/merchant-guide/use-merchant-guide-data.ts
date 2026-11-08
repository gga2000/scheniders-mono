"use client";

// Loads what the guide needs: this person's guide row, and the real shop
// state the foundation steps are checked against. The shop state refreshes
// every few seconds while a step is open, so a tick lands soon after the
// merchant saves, wherever they saved it from.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { StoreConfigV2 } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import { foundationStatus, type FoundationStatus } from "@/lib/merchant-guide/foundation";
import type { PracticeOrder } from "@/lib/merchant-guide/first-order";
import { orderKeys } from "@/hooks/use-orders-query";
import { DISPATCH_QUEUE_KEY } from "@/hooks/use-dispatch-queue";

const answersSchema = z.object({
    channel: z.enum(["online", "online_and_shop"]).optional(),
    staff: z.boolean().optional(),
});
export type GuideAnswers = z.infer<typeof answersSchema>;

const firstOrderSchema = z.object({
    started_at: z.string().optional(),
    later_at: z.string().optional(),
    done_at: z.string().optional(),
    seen: z.array(z.enum(["statuses", "whatsapp"])).optional(),
});

const phasesSchema = z.object({
    first_order: firstOrderSchema.optional(),
});
export type GuidePhases = z.infer<typeof phasesSchema>;

const progressSchema = z.object({
    answers: answersSchema,
    sound_on: z.boolean(),
    foundation_done_at: z.string().nullable(),
    done_seen_at: z.string().nullable(),
    phases: phasesSchema,
});

const PROGRESS_COLUMNS = "answers, sound_on, foundation_done_at, done_seen_at, phases";
export type GuideProgress = z.infer<typeof progressSchema>;

/** The oldest ready product, drawn on the done card. */
export interface GuideFirstProduct {
    name: string;
    imageUrl: string;
    price: number;
}

export interface GuideShopState {
    status: FoundationStatus;
    slug: string;
    working: StoreConfigV2 | null;
    firstProduct: GuideFirstProduct | null;
}

/** How often the shop is re-read while the guide is waiting on a step. */
const SHOP_REFRESH_MS = 4000;

export function guideProgressKey(tenantId: string, userId: string) {
    return ["merchant-guide-progress", tenantId, userId] as const;
}

export function guideShopKey(tenantId: string) {
    return ["merchant-guide-shop", tenantId] as const;
}

async function fetchProgress(tenantId: string, userId: string): Promise<GuideProgress | null> {
    const { data, error } = await supabase
        .from("merchant_guide_progress")
        .select(PROGRESS_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return data ? progressSchema.parse(data) : null;
}

async function fetchShop(tenantId: string): Promise<GuideShopState> {
    const [tenantRes, productsRes] = await Promise.all([
        supabase
            .from("tenants")
            .select("slug, store_config_v2, store_config_v2_draft")
            .eq("id", tenantId)
            .single(),
        supabase
            .from("products")
            // The count says whether a ready product exists; the first one is
            // drawn on the done card.
            .select("name, image_url, price", { count: "exact" })
            .eq("tenant_id", tenantId)
            .eq("status", "active")
            .eq("is_visible", true)
            .eq("is_supply", false)
            .gt("price", 0)
            .gt("stock_quantity", 0)
            .not("image_url", "is", null)
            .neq("image_url", "")
            .order("created_at", { ascending: true })
            .limit(1),
    ]);
    if (tenantRes.error) throw tenantRes.error;
    if (productsRes.error) throw productsRes.error;
    const tenant = tenantRes.data as {
        slug: string;
        store_config_v2: StoreConfigV2 | null;
        store_config_v2_draft: StoreConfigV2 | null;
    };
    const working = tenant.store_config_v2_draft ?? tenant.store_config_v2;
    const first = productsRes.data?.[0];
    return {
        slug: tenant.slug,
        working,
        firstProduct: first ? { name: first.name, imageUrl: first.image_url ?? "", price: first.price } : null,
        status: foundationStatus({
            working,
            published: tenant.store_config_v2,
            readyProducts: productsRes.count ?? 0,
        }),
    };
}

function required(value: string | null, what: string): string {
    if (!value) throw new Error(`merchant guide: ${what} is not known yet`);
    return value;
}

export function useGuideProgress(tenantId: string | null, userId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: guideProgressKey(tenantId ?? "", userId ?? ""),
        queryFn: () => fetchProgress(required(tenantId, "store"), required(userId, "user")),
        enabled: enabled && !!tenantId && !!userId,
        staleTime: Infinity,
    });
}

export function useGuideShop(tenantId: string | null, enabled: boolean, watching: boolean) {
    return useQuery({
        queryKey: guideShopKey(tenantId ?? ""),
        queryFn: () => fetchShop(required(tenantId, "store")),
        enabled: enabled && !!tenantId,
        refetchInterval: watching ? SHOP_REFRESH_MS : false,
        refetchOnWindowFocus: true,
    });
}

export type GuidePatch = Partial<{
    answers: GuideAnswers;
    sound_on: boolean;
    foundation_done_at: string | null;
    done_seen_at: string | null;
    phases: GuidePhases;
}>;

/**
 * Writes this person's guide row (creating it on first write) and keeps the
 * cached copy in step, so the guide reacts without waiting for a refetch.
 */
export function useSaveGuideProgress(tenantId: string | null, userId: string | null) {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async (patch: GuidePatch) => {
            const { data, error } = await supabase
                .from("merchant_guide_progress")
                .upsert(
                    { tenant_id: required(tenantId, "store"), user_id: required(userId, "user"), ...patch },
                    { onConflict: "tenant_id,user_id" },
                )
                .select(PROGRESS_COLUMNS)
                .single();
            if (error) throw error;
            return progressSchema.parse(data);
        },
        onSuccess: (row) => {
            queryClient.setQueryData(guideProgressKey(tenantId ?? "", userId ?? ""), row);
        },
    });
    const save = useCallback((patch: GuidePatch) => mutation.mutateAsync(patch), [mutation]);
    return { save, saving: mutation.isPending, error: mutation.error };
}

// ---------------------------------------------------------------------
// Phase 2: the practice orders
// ---------------------------------------------------------------------

/** How often the practice orders are re-read while a stop waits on them. */
const PRACTICE_REFRESH_MS = 4000;

const practiceOrderSchema = z.object({
    id: z.string(),
    status: z.string(),
    print_count: z.number().nullable(),
});

export function practiceOrdersKey(tenantId: string) {
    return ["merchant-guide-practice-orders", tenantId] as const;
}

/** This shop's live practice orders (binned ones are gone). */
export function usePracticeOrders(tenantId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: practiceOrdersKey(tenantId ?? ""),
        queryFn: async (): Promise<PracticeOrder[]> => {
            const { data, error } = await supabase
                .from("orders")
                .select("id, status, print_count")
                .eq("tenant_id", required(tenantId, "store"))
                .eq("guide_practice", true)
                .is("deleted_at", null);
            if (error) throw error;
            return z.array(practiceOrderSchema).parse(data);
        },
        enabled: enabled && !!tenantId,
        refetchInterval: enabled ? PRACTICE_REFRESH_MS : false,
        refetchOnWindowFocus: true,
    });
}

/**
 * Makes (or finds) the three practice orders and ends them. Both refresh
 * the Orders page so the cards appear and leave at once.
 */
export function usePracticeOrderActions(tenantId: string | null) {
    const queryClient = useQueryClient();
    const refresh = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: orderKeys.all }),
            queryClient.invalidateQueries({ queryKey: DISPATCH_QUEUE_KEY }),
            queryClient.refetchQueries({ queryKey: practiceOrdersKey(tenantId ?? "") }),
        ]);
    }, [queryClient, tenantId]);

    const start = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.rpc("guide_start_practice_orders", { _tenant_id: required(tenantId, "store") });
            if (error) throw error;
            await refresh();
        },
    });
    const end = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.rpc("guide_end_practice_orders", { _tenant_id: required(tenantId, "store") });
            if (error) throw error;
            await refresh();
        },
    });
    return {
        start: start.mutateAsync,
        starting: start.isPending,
        end: end.mutateAsync,
        ending: end.isPending,
    };
}
