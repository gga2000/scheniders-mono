"use client";

// Loads what the guide needs: this person's guide row, and the real shop
// state the foundation steps are checked against. The shop state refreshes
// every few seconds while a step is open, so a tick lands soon after the
// merchant saves, wherever they saved it from.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { StoreConfigV2 } from "@scheniders/shared";
import { authedFetch } from "@/lib/authed-fetch";
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
    courier: z.enum(["prime", "other"]).optional(),
});

const tourRecordSchema = z.object({
    started_at: z.string().optional(),
    later_at: z.string().optional(),
    done_at: z.string().optional(),
    seen: z.array(z.string()).optional(),
});

const phasesSchema = z.object({
    first_order: firstOrderSchema.optional(),
    courier: tourRecordSchema.optional(),
    products: tourRecordSchema.optional(),
    money: tourRecordSchema.optional(),
    customers: tourRecordSchema.optional(),
    team: tourRecordSchema.optional(),
    till: tourRecordSchema.optional(),
    look: tourRecordSchema.optional(),
    /** The staff tour, for a staff member's own row. */
    staff: tourRecordSchema.optional(),
    /** The practice after the first product: from Orders back to it, alone. */
    find_product: tourRecordSchema.optional(),
    /** «دليلك» hidden for good from its list; Settings brings it back. */
    list_hidden_at: z.string().optional(),
});
export type GuidePhases = z.infer<typeof phasesSchema>;
export type GuideTourRecord = z.infer<typeof tourRecordSchema>;

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

/** A product a shopper can buy today, before stock: live, priced, with a photo. */
function readyProductsQuery(columns: string) {
    return supabase
        .from("products")
        .select(columns, { count: "exact" })
        .eq("status", "active")
        .eq("is_visible", true)
        .eq("is_supply", false)
        .gt("price", 0)
        .not("image_url", "is", null)
        .neq("image_url", "");
}

const readyProductSchema = z.object({
    name: z.string(),
    image_url: z.string().nullable(),
    price: z.coerce.number(),
    created_at: z.string(),
});

async function fetchShop(tenantId: string): Promise<GuideShopState> {
    const [tenantRes, plainRes, sizedRes] = await Promise.all([
        supabase
            .from("tenants")
            .select("slug, store_config_v2, store_config_v2_draft")
            .eq("id", tenantId)
            .single(),
        // The count says whether a ready product exists; the oldest one is
        // drawn on the done card. A product with stock on its own row...
        readyProductsQuery("name, image_url, price, created_at")
            .eq("tenant_id", tenantId)
            .gt("stock_quantity", 0)
            .order("created_at", { ascending: true })
            .limit(1),
        // ...or one sold in sizes, whose stock is on its sizes only (B10):
        // an enabled size with stock makes it ready.
        readyProductsQuery("name, image_url, price, created_at, product_variants!inner(id)")
            .eq("tenant_id", tenantId)
            .gt("product_variants.stock_quantity", 0)
            .or("is_enabled.is.null,is_enabled.eq.true", { referencedTable: "product_variants" })
            .order("created_at", { ascending: true })
            .limit(1),
    ]);
    if (tenantRes.error) throw tenantRes.error;
    if (plainRes.error) throw plainRes.error;
    if (sizedRes.error) throw sizedRes.error;
    const tenant = tenantRes.data as {
        slug: string;
        store_config_v2: StoreConfigV2 | null;
        store_config_v2_draft: StoreConfigV2 | null;
    };
    const working = tenant.store_config_v2_draft ?? tenant.store_config_v2;
    const first = [...z.array(readyProductSchema).parse(plainRes.data ?? []), ...z.array(readyProductSchema).parse(sizedRes.data ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return {
        slug: tenant.slug,
        working,
        firstProduct: first ? { name: first.name, imageUrl: first.image_url ?? "", price: first.price } : null,
        status: foundationStatus({
            working,
            published: tenant.store_config_v2,
            readyProducts: (plainRes.count ?? 0) + (sizedRes.count ?? 0),
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
    source: z.string().nullable(),
});

const PRACTICE_COLUMNS = "id, status, print_count, source";

export function practiceOrdersKey(tenantId: string) {
    return ["merchant-guide-practice-orders", tenantId] as const;
}

/**
 * This shop's live practice orders (binned ones are gone), and the test
 * orders the merchant placed on their own store (draft view) since the phase
 * started. Off until the phase starts.
 */
export function usePracticeOrders(tenantId: string | null, startedAt: string | null) {
    const enabled = startedAt !== null && !!tenantId;
    return useQuery({
        queryKey: [...practiceOrdersKey(tenantId ?? ""), startedAt],
        queryFn: async (): Promise<PracticeOrder[]> => {
            const store = required(tenantId, "store");
            const [practice, fromStore] = await Promise.all([
                supabase.from("orders").select(PRACTICE_COLUMNS).eq("tenant_id", store).eq("guide_practice", true).is("deleted_at", null),
                supabase
                    .from("orders")
                    .select(PRACTICE_COLUMNS)
                    .eq("tenant_id", store)
                    .eq("is_test", true)
                    .eq("guide_practice", false)
                    .eq("source", "storefront")
                    .gte("created_at", required(startedAt, "phase start"))
                    .is("deleted_at", null),
            ]);
            if (practice.error) throw practice.error;
            if (fromStore.error) throw fromStore.error;
            return z.array(practiceOrderSchema).parse([...practice.data, ...fromStore.data]);
        },
        enabled,
        refetchInterval: enabled ? PRACTICE_REFRESH_MS : false,
        refetchOnWindowFocus: true,
    });
}

const storeOrderLinkSchema = z.object({ success: z.literal(true), data: z.object({ url: z.string().url() }) });

/** Opens the shop's own store in draft view, where an order is a test order. A fresh link lasts 2 hours. */
export function useStoreOrderLink(enabled: boolean) {
    return useQuery({
        queryKey: ["merchant-guide-store-order-link"],
        queryFn: async (): Promise<string> => {
            const res = await authedFetch("/api/guide/store-order-link");
            if (!res.ok) throw new Error(`Store order link failed: ${res.status}`);
            return storeOrderLinkSchema.parse(await res.json()).data.url;
        },
        enabled,
        staleTime: 30 * 60_000,
        refetchInterval: 30 * 60_000,
        retry: 1,
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
    // Ends the practice orders and, from the phase's start, the merchant's own test orders from their store.
    const end = useMutation({
        mutationFn: async (since: string | undefined) => {
            const { error } = await supabase.rpc("guide_end_practice_orders", {
                _tenant_id: required(tenantId, "store"),
                ...(since ? { _store_orders_since: since } : {}),
            });
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
