// apps/platform/hooks/chat/use-order-actions.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useConversations, chatKeys } from "./use-conversations";
import { useOrdersContext } from "@/components/providers/orders-provider";
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
 * Returns the live `Order` object linked to a conversation, or `null` when:
 * - the conversation is not an order thread (`order_id` is null), or
 * - the order is not yet loaded in the orders context.
 */
export function useOrderForConversation(conversationId: string | null): Order | null {
    const { data: conversations = [] } = useConversations();
    const { orders } = useOrdersContext();

    const conv = conversationId ? conversations.find((c) => c.id === conversationId) : null;
    const orderId = conv?.order_id ?? null;
    if (!orderId) return null;

    return orders.find((o) => o.id === orderId) ?? null;
}
