"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { supabase } from "@/lib/supabase";
import { OrderTagSchema, type OrderTag, type TagColor } from "@/lib/orders/order-tags";
import type { Order } from "@/types/order";

const tagsKey = (tenantId: string | null | undefined) => ["order-tags", tenantId] as const;

/** The store's order tags, alphabetical. RLS limits them to the signed-in store. */
export function useOrderTags(): { tags: readonly OrderTag[]; isLoading: boolean } {
    const { session, clientReady, tenantId } = useAuth();
    const { data, isLoading } = useQuery({
        queryKey: tagsKey(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const { data: rows, error } = await supabase
                .from("order_tags")
                .select("id, name, color")
                .eq("tenant_id", tenantId)
                .order("name");
            if (error) throw error;
            return z.array(OrderTagSchema).parse(rows ?? []);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
    });
    return { tags: data ?? [], isLoading };
}

/** Create, rename, recolour and delete the store's tags. */
export function useOrderTagMutations() {
    const { tenantId } = useAuth();
    const qc = useQueryClient();
    const refresh = () => qc.invalidateQueries({ queryKey: tagsKey(tenantId) });

    const create = useMutation({
        mutationFn: async ({ name, color }: { name: string; color: TagColor }) => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase
                .from("order_tags")
                .insert({ tenant_id: tenantId, name, color })
                .select("id, name, color")
                .single();
            if (error) throw error;
            return OrderTagSchema.parse(data);
        },
        onSuccess: refresh,
    });

    const update = useMutation({
        mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: TagColor }) => {
            const { error } = await supabase.from("order_tags").update({ name, color }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: refresh,
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("order_tags").delete().eq("id", id);
            if (error) throw error;
        },
        // The database takes the tag off every order, so the list reloads too.
        onSuccess: () => {
            void refresh();
            void qc.invalidateQueries({ queryKey: orderKeys.lists() });
        },
    });

    return { create, update, remove };
}

/** Set an order's tags, showing the change at once and rolling it back on failure. */
export function useSetOrderTags() {
    const qc = useQueryClient();
    const patch = (orderId: string, tagIds: string[]) =>
        qc.setQueryData<Order[]>(orderKeys.lists(), (old) =>
            old?.map((o) => (o.id === orderId ? { ...o, tag_ids: tagIds } : o)),
        );

    return useMutation({
        mutationFn: async ({ orderId, tagIds }: { orderId: string; tagIds: string[]; previous: string[] }) => {
            const { data, error } = await supabase
                .from("orders")
                .update({ tag_ids: tagIds })
                .eq("id", orderId)
                .select("id")
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("Tag update was rejected");
        },
        onMutate: ({ orderId, tagIds }) => patch(orderId, tagIds),
        onError: (_err, { orderId, previous }) => patch(orderId, previous),
    });
}
