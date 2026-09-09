import { useMemo } from "react";
// apps/platform/hooks/chat/use-order-actions.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useConversations, chatKeys } from "./use-conversations";
import { useOrdersByIdQuery, type LinkedOrder } from "@/hooks/use-orders-by-id-query";
import { orderKeys } from "@/hooks/use-orders-query";
import type { Order } from "@/types/order";

/**
 * Assign an order to a teammate (or unassign by passing null).
 * Calls the `chat_assign_order` RPC which guards tenant membership.
 * Invalidates orders + conversations on success so live card + event pill appear.
 */
export function useAssignOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ orderId, userId }: { orderId: string; userId: string | null }) => {
            const { error } = await supabase.rpc("chat_assign_order", {
                p_order_id: orderId,
                p_user_id: userId,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: orderKeys.lists() });
            void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}

/**
 * Mark an order thread as resolved or unresolved.
 * Calls `chat_set_conversation_resolved` which guards membership.
 */
export function useSetConversationResolved() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ conversationId, resolved }: { conversationId: string; resolved: boolean }) => {
            const { error } = await supabase.rpc("chat_set_conversation_resolved", {
                p_conversation_id: conversationId,
                p_resolved: resolved,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}

/**
 * The order linked to a conversation, or `null` when the conversation is not an
 * order thread or the order has not arrived yet.
 *
 * PERF-D1: this used to scan the whole order book held in context. It now
 * fetches the one order it needs, sharing the ["orders","byId"] cache with
 * conversation-list.
 */
export function useOrderForConversation(conversationId: string | null): LinkedOrder | null {
    const { data: conversations = [] } = useConversations();
    const conv = conversationId ? conversations.find((c) => c.id === conversationId) : null;
    const orderId = conv?.order_id ?? null;
    const byId = useOrdersByIdQuery(useMemo(() => (orderId ? [orderId] : []), [orderId]));
    return orderId ? byId.get(orderId) ?? null : null;
}
