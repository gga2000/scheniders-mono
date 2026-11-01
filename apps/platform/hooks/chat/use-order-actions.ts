// apps/platform/hooks/chat/use-order-actions.ts
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useConversations, chatKeys } from "./use-conversations";
import { useLinkedOrders } from "./use-linked-orders";
import type { Order } from "@/types/order";

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
 * Returns the `Order` linked to a conversation, or `null` when:
 * - the conversation is not an order thread (`order_id` is null), or
 * - the order has not loaded yet.
 *
 * Read through `useLinkedOrders`, so an order outside the /orders date window
 * is fetched instead of reading as missing.
 */
export function useOrderForConversation(conversationId: string | null): Order | null {
    const { data: conversations = [] } = useConversations();
    const conv = conversationId ? conversations.find((c) => c.id === conversationId) : null;
    const orderId = conv?.order_id ?? null;
    const ids = useMemo(() => (orderId ? [orderId] : []), [orderId]);
    const linked = useLinkedOrders(ids);
    return orderId ? linked.get(orderId) ?? null : null;
}
