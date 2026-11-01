"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { productRepository } from "@/lib/repositories/product-repository";
import { PRODUCT_READ_COLUMNS } from "@/lib/repositories/product-columns";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { QCItem, QCStatus, QCResolution, QCEvent, QCReasonCategory } from "@/types/product";
import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";

export const qcKeys = {
    all: ["qc_items"] as const,
    lists: () => [...qcKeys.all, "list"] as const,
    events: (id: string) => [...qcKeys.all, "events", id] as const,
};

/**
 * The order fields a quarantine row shows. Named, never `orders(*)`: PostgREST
 * expands an embedded `*` into a full read of `public.orders`, which migration
 * 20261021090000 refuses with 42501 once the margin columns leave
 * `authenticated`'s grant (orders-select-guard.test.ts).
 */
const QC_ORDER_COLUMNS = "id, order_id, customer_name, phone, status, created_at, tenant_id";
const QC_ITEM_COLUMNS = `*, product:products(${PRODUCT_READ_COLUMNS}), order:orders(${QC_ORDER_COLUMNS})` as const;

async function fetchQCItems(): Promise<QCItem[]> {
    const { data, error } = await supabase
        .from("qc_quarantine")
        .select(QC_ITEM_COLUMNS)
        .order("created_at", { ascending: false });

    if (error) throw error;
    const items = (data || []) as QCItem[];
    // Cost is not a readable column; it comes per store from product_costs,
    // and only for members who may see it (the held-stock value stays 0
    // otherwise).
    const tenants = [...new Set(items.map((item) => item.tenant_id).filter((id): id is string => !!id))];
    const costs = await Promise.all(tenants.map((tenant) => productRepository.getProductCosts(tenant)));
    const costOf = (id: string) => costs.reduce<number | null>((found, map) => found ?? map.get(id) ?? null, null);
    return items.map((item) =>
        item.product ? { ...item, product: { ...item.product, cost: costOf(item.product.id) ?? undefined } } : item
    );
}

async function fetchQCEvents(qcItemId: string): Promise<QCEvent[]> {
    const { data, error } = await supabase
        .from("qc_quarantine_events")
        .select("*")
        .eq("qc_item_id", qcItemId)
        .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []) as QCEvent[];
}

export function useInventoryQC() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const { t } = useLanguage();

    const { data: qcItems, isLoading, error, refetch } = useQuery({
        queryKey: qcKeys.lists(),
        queryFn: fetchQCItems,
    });

    // Track IDs already known to this client so realtime INSERTs that echo
    // rows we already have (e.g. because the current user's own local
    // mutation already populated the cache, or initial list fetch finished
    // after the INSERT fired) don't fire a duplicate toast.
    const knownIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        knownIdsRef.current = new Set((qcItems || []).map((i) => i.id));
    }, [qcItems]);

    // ─── Realtime: new items slide in, toast fires ────────────────────────
    // The INSERT payload only contains columns from `qc_quarantine` — it
    // won't include the `product` / `order` joins the
    // list query selects. We therefore do a lightweight refetch of the list
    // to hydrate relations rather than trying to merge the raw row.
    useEffect(() => {
        // Wait until we know the tenant scope before subscribing so the
        // channel filter matches what RLS will allow us to see anyway.
        if (!tenantId) return;

        // Unique suffix per effect invocation so StrictMode's
        // mount→cleanup→mount cycle doesn't hand us back a channel that's
        // already been `.subscribe()`d (supabase-js dedupes by topic, and
        // `removeChannel` is async).
        const channelName = `qc_quarantine_changes_${tenantId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const filter = `tenant_id=eq.${tenantId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "qc_quarantine", filter },
                (payload: RealtimePostgresInsertPayload<QCItem>) => {
                    const id = payload.new?.id;

                    // Suppress the toast if we already have this row — either
                    // because a local mutation inserted it and the cache was
                    // already primed, or because the realtime INSERT is just
                    // echoing a row the initial list fetch already returned.
                    const isOwnOrKnown = !!id && knownIdsRef.current.has(id);

                    if (!isOwnOrKnown) {
                        toast.warning(
                            t("qc.toast.newItem.title"),
                            t("qc.toast.newItem.desc")
                        );
                    }

                    queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
                }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "qc_quarantine", filter },
                () => {
                    // Silent reconciliation — e.g. another inspector resolved
                    // or reassigned an item; just refresh the list.
                    queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
                }
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "qc_quarantine", filter },
                () => {
                    queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // `t` and `queryClient` are stable enough in practice; intentionally
        // omit them from deps so we don't tear down the channel on language
        // toggle or router re-renders. Only tenantId matters for resubscribe.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    // ─── Mutations ────────────────────────────────────────────────────────
    const resolveItemMutation = useMutation({
        mutationFn: async ({
            id,
            resolution,
            productId,
            quantity,
            extras,
        }: {
            id: string;
            resolution: QCResolution;
            productId: string;
            quantity: number;
            extras?: { rma_number?: string; credit_expected?: number; notes?: string };
        }) => {
            const { resolveQuarantine } = await import("@/lib/inventory-engine");
            const result = await resolveQuarantine(id, resolution, productId, quantity, extras);
            if (!result.success) throw new Error(result.error);
            return { id, resolution };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ["products"] });
        },
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: QCStatus }) => {
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ status })
                .eq("id", id);
            if (error) throw error;
            return { id, status };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const assignInspectorMutation = useMutation({
        mutationFn: async ({ id, userId }: { id: string; userId: string | null }) => {
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ assigned_to: userId })
                .eq("id", id);
            if (error) throw error;
            return { id, userId };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const updateNotesMutation = useMutation({
        mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ notes })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const updateReasonCategoryMutation = useMutation({
        mutationFn: async ({ id, category }: { id: string; category: QCReasonCategory }) => {
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ reason_category: category })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const addPhotosMutation = useMutation({
        mutationFn: async ({ id, urls }: { id: string; urls: string[] }) => {
            const { data: existing } = await supabase
                .from("qc_quarantine")
                .select("photos")
                .eq("id", id)
                .single();
            const current = (existing?.photos as string[] | null) || [];
            const next = [...current, ...urls];
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ photos: next })
                .eq("id", id);
            if (error) throw error;
            return next;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const removePhotoMutation = useMutation({
        mutationFn: async ({ id, url }: { id: string; url: string }) => {
            const { data: existing } = await supabase
                .from("qc_quarantine")
                .select("photos")
                .eq("id", id)
                .single();
            const current = (existing?.photos as string[] | null) || [];
            const next = current.filter((u) => u !== url);
            const { error } = await supabase
                .from("qc_quarantine")
                .update({ photos: next })
                .eq("id", id);
            if (error) throw error;
            return next;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
        },
    });

    const bulkResolveMutation = useMutation({
        mutationFn: async ({
            ids,
            resolution,
        }: {
            ids: string[];
            resolution: QCResolution;
        }) => {
            const items = (qcItems || []).filter((i) => ids.includes(i.id));
            const { resolveQuarantine } = await import("@/lib/inventory-engine");
            let failed = 0;
            for (const item of items) {
                const result = await resolveQuarantine(item.id, resolution, item.product_id, item.quantity);
                if (!result.success) failed += 1;
            }
            // Items that did resolve stay resolved; the caller is told some did not.
            if (failed > 0) throw new Error(`${failed} of ${items.length} items could not be resolved`);
            return ids;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ["products"] });
        },
    });

    /**
     * Reverts a prior bulk resolution. Resets each item's status back to
     * its previous value (typically `pending_inspection`) and restores any
     * stock that `resolveQuarantine` deducted for `written_off` or
     * `returned_to_supplier` resolutions. Intended to power an Undo toast
     * on the bulk bar — should be called within a short window after the
     * original bulk mutation so the resolved state still matches.
     */
    const bulkRevertMutation = useMutation({
        mutationFn: async ({
            snapshots,
        }: {
            snapshots: Array<{
                id: string;
                productId: string;
                quantity: number;
                previousStatus: QCStatus;
                appliedResolution: QCResolution;
            }>;
        }) => {
            for (const snap of snapshots) {
                // Only an item still in the state the bulk action put it in: a double
                // click on Undo finds none and must not add the stock back twice.
                const { data: reverted, error } = await supabase
                    .from("qc_quarantine")
                    .update({
                        status: snap.previousStatus,
                        resolved_at: null,
                    })
                    .eq("id", snap.id)
                    .eq("status", snap.appliedResolution)
                    .select("id");
                if (error) throw error;
                if (!reverted || reverted.length === 0) continue;

                const restoresPhysical =
                    snap.appliedResolution === "written_off" ||
                    snap.appliedResolution === "returned_to_supplier";
                if (restoresPhysical) {
                    await productRepository.adjustStock({ productId: snap.productId, delta: snap.quantity, reason: "qc_undo" });
                }
            }
            return snapshots.map((s) => s.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ["products"] });
        },
    });

    return {
        qcItems: qcItems || [],
        isLoading,
        error,
        refetch,
        resolveItem: (id: string, resolution: QCResolution, productId: string, quantity: number, extras?: { rma_number?: string; credit_expected?: number; notes?: string }) =>
            resolveItemMutation.mutateAsync({ id, resolution, productId, quantity, extras }),
        updateStatus: (id: string, status: QCStatus) =>
            updateStatusMutation.mutateAsync({ id, status }),
        assignInspector: (id: string, userId: string | null) =>
            assignInspectorMutation.mutateAsync({ id, userId }),
        updateNotes: (id: string, notes: string) =>
            updateNotesMutation.mutateAsync({ id, notes }),
        updateReasonCategory: (id: string, category: QCReasonCategory) =>
            updateReasonCategoryMutation.mutateAsync({ id, category }),
        addPhotos: (id: string, urls: string[]) =>
            addPhotosMutation.mutateAsync({ id, urls }),
        removePhoto: (id: string, url: string) =>
            removePhotoMutation.mutateAsync({ id, url }),
        bulkResolve: (ids: string[], resolution: QCResolution) =>
            bulkResolveMutation.mutateAsync({ ids, resolution }),
        bulkRevert: (
            snapshots: Array<{
                id: string;
                productId: string;
                quantity: number;
                previousStatus: QCStatus;
                appliedResolution: QCResolution;
            }>
        ) => bulkRevertMutation.mutateAsync({ snapshots }),
    };
}

export function useQCEvents(qcItemId: string | null) {
    return useQuery({
        queryKey: qcKeys.events(qcItemId || "none"),
        queryFn: () => (qcItemId ? fetchQCEvents(qcItemId) : Promise.resolve([])),
        enabled: !!qcItemId,
    });
}
