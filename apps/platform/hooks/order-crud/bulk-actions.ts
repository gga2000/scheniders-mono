"use client";

import type { MutableRefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AuthContextType } from "@/types/auth";
import type { useLanguage } from "@/hooks/use-language";
import { supabase, type Order } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import { MAX_ORDER_IDS_PER_REQUEST } from "@/lib/order-api-schemas";
import { toast } from "@/hooks/use-toast";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { useOrderStore } from "@/store/use-order-store";
import type { BatchOutcome, BulkProgress } from "@/lib/order-bulk-batches";
import {
    type BulkFailure,
    summarizeBulkFailures,
    formatFailedOrderList,
    findUnaffectedIds,
} from "@/lib/order-bulk-result";

// Bulk status, reschedule, archive, unarchive and delete for useOrderCrud.
// Built fresh on every render from the hook's current state, so each call sees
// the same closure the hook itself would.

/** What a bulk status change did, order by order. */
export type BulkStatusResult = {
    /** True only when every order changed. */
    success: boolean;
    /** Why some or all did not, worded for the operator. */
    error?: string;
    /** Orders that changed. */
    count: number;
    attempted: number;
    succeededIds: string[];
    failures: BulkFailure[];
};

export interface OrderCrudContext {
    orders: Order[];
    tenantId: string | null;
    session: AuthContextType["session"];
    authRef: MutableRefObject<Pick<AuthContextType, "user" | "profile" | "session">>;
    tRef: MutableRefObject<ReturnType<typeof useLanguage>["t"]>;
    queryClient: QueryClient;
    optimisticUpdate: (updater: (prev: Order[]) => Order[]) => void;
}

export function createBulkActions({ orders, tenantId, session, authRef, tRef, queryClient, optimisticUpdate }: OrderCrudContext) {
    // =============================================
    // BULK OPERATIONS
    // =============================================

    /**
     * Change many orders' status. Runs in small sequential batches (see
     * lib/order-bulk-batches): each batch's history rows are written as soon as
     * the batch lands, and the cache moves with it, so the list updates while
     * the rest are still in flight and a late failure cannot lose the history of
     * orders that already changed.
     *
     * With `notify: false` the caller owns the messaging (the orders page's
     * counting toast); otherwise a partial failure is reported here.
     */
    async function bulkUpdateStatus(
        orderIds: string[],
        status: Order["status"],
        options: { onProgress?: (progress: BulkProgress) => void; notify?: boolean } = {},
    ): Promise<BulkStatusResult> {
        const { onProgress, notify = true } = options;
        // Read the concurrency token from the live cache, not this render's
        // `orders`: a retry fired from a toast holds an old closure, and after
        // a realtime refresh its versions would be a guaranteed false conflict.
        const wanted = new Set(orderIds);
        const cached = queryClient.getQueryData<Order[]>(orderKeys.lists()) ?? [];
        const freshById = new Map(cached.filter(o => wanted.has(o.id)).map(o => [o.id, o]));
        const previousOrders = orders
            .filter(o => wanted.has(o.id))
            .map(o => freshById.get(o.id) ?? o);
        for (const [id, o] of freshById) {
            if (!previousOrders.some(p => p.id === id)) previousOrders.push(o);
        }
        const expectedVersions: { [key: string]: number } = {};
        previousOrders.forEach(o => {
            if (typeof o.version === "number") expectedVersions[o.id] = o.version;
        });

        // Get current user information for attribution
        const { profile: currentProfile, user: currentUser } = authRef.current;
        const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
        const changedByAvatar = currentProfile?.avatar_url;

        /** After each batch: cache and the non-trigger inventory side-effects. */
        const settleBatch = async ({ succeeded }: BatchOutcome<{ id: string; order: Order }>) => {
            if (succeeded.length === 0) return;

            // History rows come from the database trigger on the status change.

            // Take the written row's version, not just its status: keeping the
            // old version in cache made the next edit of these orders a false
            // "changed by someone else" conflict.
            const written = new Map(succeeded.map(({ id, order }) => [id, order]));
            optimisticUpdate((prev) =>
                prev.map((order) => {
                    const next = written.get(order.id);
                    if (!next) return order;
                    return {
                        ...order,
                        status: next.status,
                        version: next.version,
                        updated_at: next.updated_at,
                        completed_at: next.completed_at,
                        delivered_at: next.delivered_at,
                        cancelled_at: next.cancelled_at,
                        rejection_reason: next.rejection_reason,
                        reason_id: next.reason_id,
                    };
                })
            );
        };

        const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateStatus(
            orderIds,
            status,
            undefined, // rejectionReason
            changedBy,
            changedByAvatar || undefined,
            expectedVersions,
            { onBatchSettled: settleBatch, onProgress },
        );

        const attempted = successfulOperations.length + failedOperations.length;
        const result: BulkStatusResult = {
            success: failedOperations.length === 0,
            count: successfulOperations.length,
            attempted,
            succeededIds: successfulOperations.map(op => op.id),
            failures: failedOperations,
        };

        if (failedOperations.length > 0) {
            const summary = summarizeBulkFailures(failedOperations, previousOrders, attempted, "updated");
            result.error = summary.description;
            console.warn(`[bulkUpdateStatus] ${summary.title}`, failedOperations);
            if (notify) {
                toast.warning(summary.title, summary.description);
                // Keep the failures selected so a retry does not need reselecting.
                useOrderStore.getState().setSelectedOrders(new Set(summary.failedIds));
            }
        }

        return result;
    }

    /**
     * Move many orders to another day, or clear the postponement with `null`.
     * Same shape as `bulkUpdateStatus`: small sequential batches with the
     * version guard and the cache moved as each batch lands. The history entry
     * (old day → new day) is written by the database trigger log_order_events,
     * credited to the signed-in user.
     */
    async function bulkReschedule(
        orderIds: string[],
        scheduledDate: string | null,
        options: { onProgress?: (progress: BulkProgress) => void } = {},
    ): Promise<BulkStatusResult> {
        const wanted = new Set(orderIds);
        const cached = queryClient.getQueryData<Order[]>(orderKeys.lists()) ?? [];
        const freshById = new Map(cached.filter(o => wanted.has(o.id)).map(o => [o.id, o]));
        const previousOrders = orders
            .filter(o => wanted.has(o.id))
            .map(o => freshById.get(o.id) ?? o);
        for (const [id, o] of freshById) {
            if (!previousOrders.some(p => p.id === id)) previousOrders.push(o);
        }
        const expectedVersions: { [key: string]: number } = {};
        previousOrders.forEach(o => {
            if (typeof o.version === "number") expectedVersions[o.id] = o.version;
        });

        const settleBatch = async ({ succeeded }: BatchOutcome<{ id: string; order: Order }>) => {
            if (succeeded.length === 0) return;

            const written = new Map(succeeded.map(({ id, order }) => [id, order]));
            optimisticUpdate((prev) =>
                prev.map((order) => {
                    const next = written.get(order.id);
                    if (!next) return order;
                    return {
                        ...order,
                        scheduled_date: next.scheduled_date,
                        version: next.version,
                        updated_at: next.updated_at,
                    };
                })
            );
        };

        const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateScheduledDate(
            orderIds,
            scheduledDate,
            expectedVersions,
            { onBatchSettled: settleBatch, onProgress: options.onProgress },
        );

        return {
            success: failedOperations.length === 0,
            count: successfulOperations.length,
            attempted: successfulOperations.length + failedOperations.length,
            succeededIds: successfulOperations.map(op => op.id),
            failures: failedOperations,
        };
    }

    async function bulkArchive(orderIds: string[]) {
        try {
            // `.in()` succeeds even when RLS filters rows out, so ask which rows
            // were actually written rather than assuming the whole selection was.
            const { data: archived, error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: true })
                .in("id", orderIds)
                .select("id");

            if (updateError) throw updateError;

            const archivedIds = (archived ?? []).map((row) => row.id);
            const skipped = findUnaffectedIds(orderIds, archivedIds);
            if (skipped.length > 0) {
                toast.warning(
                    tRef.current("orders.toast.notArchived", { skipped: skipped.length, total: orderIds.length }),
                    tRef.current("orders.toast.notArchivedDesc", { list: formatFailedOrderList(skipped, orders) }),
                );
            }

            if (archivedIds.length > 0) {
                activityLogger.log({
                    action: 'order.edit',
                    entityType: 'order',
                    entityId: archivedIds[0],
                    details: { note: `Archived ${archivedIds.length} orders`, order_ids: archivedIds },
                }, tenantId);
            }

            // Remove archived orders from active list in cache
            optimisticUpdate((prev) => prev.filter((order) => !archivedIds.includes(order.id)));
            return { success: true, count: archivedIds.length };
        } catch (err) {
            console.error("Error archiving orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to archive orders",
            };
        }
    }

    async function bulkUnarchive(orderIds: string[]) {
        try {
            const { data: unarchived, error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: false })
                .in("id", orderIds)
                .select("id");

            if (updateError) throw updateError;

            const unarchivedIds = (unarchived ?? []).map((row) => row.id);
            const skipped = findUnaffectedIds(orderIds, unarchivedIds);
            if (skipped.length > 0) {
                toast.warning(
                    tRef.current("orders.toast.notUnarchived", { skipped: skipped.length, total: orderIds.length }),
                    tRef.current("orders.toast.notUnarchivedDesc", { list: formatFailedOrderList(skipped, orders) }),
                );
            }

            if (unarchivedIds.length > 0) {
                activityLogger.log({
                    action: 'order.edit',
                    entityType: 'order',
                    entityId: unarchivedIds[0],
                    details: { note: `Unarchived ${unarchivedIds.length} orders`, order_ids: unarchivedIds },
                }, tenantId);
            }

            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            return { success: true, count: unarchivedIds.length };
        } catch (err) {
            console.error("Error unarchiving orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to unarchive orders",
            };
        }
    }

    async function bulkDelete(orderIds: string[]) {
        try {
            const uniqueOrderIds = Array.from(new Set(orderIds));
            if (uniqueOrderIds.length === 0) {
                return { success: true, count: 0 };
            }

            // Get current session token for server-side auth verification from context
            if (!session?.access_token) {
                throw new Error("Not authenticated. Please sign in again.");
            }

            // The delete route caps a single request at MAX_ORDER_IDS_PER_REQUEST
            // ids, so "select all" over a large book is sent in chunks. Each chunk
            // is independent: a later failure does not undo earlier deletions, and
            // the caller still receives the true deleted set.
            const deletedIds = new Set<string>();
            let chunkError: string | null = null;

            for (let i = 0; i < uniqueOrderIds.length; i += MAX_ORDER_IDS_PER_REQUEST) {
                const chunk = uniqueOrderIds.slice(i, i + MAX_ORDER_IDS_PER_REQUEST);
                const res = await fetch("/api/orders/delete", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ ids: chunk }),
                });

                const result = await res.json();
                if (!result.success) {
                    chunkError = result.error || "Failed to delete orders";
                    break;
                }
                for (const id of (result.deletedIds || []) as string[]) deletedIds.add(id);
            }


            // Only fail outright if nothing at all was deleted; otherwise report
            // the partial result so the UI can show what actually happened.
            if (chunkError && deletedIds.size === 0) {
                throw new Error(chunkError);
            }

            if (deletedIds.size === 0) {
                throw new Error("No orders were deleted.");
            }

            optimisticUpdate((prev) => prev.filter((order) => !deletedIds.has(order.id)));

            // Invalidate React Query cache so stale data doesn't reappear
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });

            return {
                success: deletedIds.size === uniqueOrderIds.length,
                count: deletedIds.size,
                requestedCount: uniqueOrderIds.length,
                deletedIds: Array.from(deletedIds),
            };
        } catch (err) {
            console.error("Error deleting orders:", err);
            const msg = err instanceof Error ? err.message : "Failed to delete orders";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    return { bulkUpdateStatus, bulkReschedule, bulkArchive, bulkUnarchive, bulkDelete };
}
