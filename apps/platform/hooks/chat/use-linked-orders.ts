"use client";

import { useEffect, useId, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { pickListColumns } from "@/lib/repositories/order-columns";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { shouldApplyRealtimeUpdate } from "@/lib/realtime-batcher";
import { supabase } from "@/lib/supabase";
import { diag } from "@/lib/diag";
import type { Order } from "@/types/order";

/**
 * Keyed under `orderKeys.lists()` so every order mutation and realtime resync
 * that invalidates the list refreshes these too (same reasoning as
 * `orderSearchKeys`).
 */
export const linkedOrderKeys = {
    all: [...orderKeys.lists(), "linked"] as const,
    ids: (tenantId: string | null, ids: readonly string[]) => [...linkedOrderKeys.all, tenantId, ids] as const,
};

const EMPTY: ReadonlyMap<string, Order> = new Map();

/** The part of a realtime UPDATE payload that decides what happens to a linked order. */
const UpdatedRowSchema = z.object({
    id: z.string(),
    deleted_at: z.string().nullish(),
});

/**
 * Apply one realtime UPDATE of an `orders` row to every cached linked-order
 * list. Same rules as the book's batcher: the list columns only, the newer
 * `version` wins, and fields the row does not carry (the risk data
 * `withRiskData` joins in) are kept from the cached copy. A soft-deleted row
 * leaves the lists, as `findByIds` would not return it.
 */
export function applyLinkedOrderUpdate(queryClient: QueryClient, raw: Record<string, unknown>): void {
    const row = UpdatedRowSchema.safeParse(raw);
    if (!row.success) {
        diag.warn(`[linked-orders] unexpected UPDATE payload: ${row.error.message}`);
        return;
    }
    const { id, deleted_at } = row.data;
    const incoming = normalizeOrder(pickListColumns(raw) as unknown as Order);
    queryClient.setQueriesData<Order[]>({ queryKey: linkedOrderKeys.all }, (old) => {
        if (!old) return old;
        const index = old.findIndex((o) => o.id === id);
        if (index === -1) return old;
        if (deleted_at) return old.filter((o) => o.id !== id);
        const cached = old[index];
        if (!shouldApplyRealtimeUpdate(cached, incoming)) return old;
        const next = [...old];
        next[index] = { ...cached, ...incoming };
        return next;
    });
}

/**
 * Keeps the linked orders live while a chat view shows them.
 *
 * Chat used to read the root-mounted book, whose realtime channel kept it live.
 * It now reads its own query, which nothing else patches, so it listens for
 * itself. Only while
 * some thread links to an order (the chat panel is open), tenant-filtered like
 * every orders channel (RLS admits every tenant the user belongs to), and only
 * UPDATEs: a linked order already exists, and a soft delete is an UPDATE.
 * After a reconnect the lists are refetched, since events were missed.
 */
function useLinkedOrdersLive(tenantId: string | null, active: boolean): void {
    const queryClient = useQueryClient();
    const instanceId = useId();

    useEffect(() => {
        if (!tenantId || !active) return;
        let connected = false;
        let dropped = false;
        const channel = supabase
            .channel(`orders_linked:${tenantId}:${instanceId}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
                (payload) => applyLinkedOrderUpdate(queryClient, payload.new),
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    if (connected && dropped) {
                        void queryClient.invalidateQueries({ queryKey: linkedOrderKeys.all });
                    }
                    connected = true;
                    dropped = false;
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    dropped = true;
                    if (status !== "CLOSED") {
                        diag.warn(`[linked-orders] channel ${status}${err ? ` ${err.message}` : ""}`);
                    }
                }
            });
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [tenantId, active, instanceId, queryClient]);
}

/**
 * The orders a set of chat threads link to, by order uuid.
 *
 * Fetched by id, never looked up in the order book. Chat is mounted by the root
 * layout, above the routes that mount <OrdersProvider>, so there is no book to
 * read on any route; and the book was only the /orders date window (default:
 * today) anyway, so a thread for an order placed on another day lost its status,
 * price and action bar. Kept live by its own realtime channel, so a teammate's
 * status change or assignment shows in an open thread, and the action bar sends
 * the current `version` with its next change.
 */
export function useLinkedOrders(ids: readonly string[]): ReadonlyMap<string, Order> {
    const { session, clientReady, tenantId } = useAuth();

    const wanted = useMemo(() => [...new Set(ids)].sort(), [ids]);
    const enabled = wanted.length > 0 && !!session && clientReady && !!tenantId;

    const { data: fetched } = useQuery({
        queryKey: linkedOrderKeys.ids(tenantId, wanted),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findByIds(tenantId, wanted);
        },
        enabled,
        staleTime: 60_000,
    });

    useLinkedOrdersLive(tenantId, enabled);

    return useMemo(() => {
        if (wanted.length === 0 || !fetched) return EMPTY;
        return new Map(fetched.map((o) => [o.id, o]));
    }, [wanted.length, fetched]);
}
