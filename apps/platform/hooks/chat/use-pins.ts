// apps/platform/hooks/chat/use-pins.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { chatKeys } from "./use-conversations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatPin {
    message_id: string;
    pinned_at: string;
    message: {
        id: string;
        body: string;
        sender_id: string | null;
        created_at: string;
        is_system: boolean | null;
    } | null;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function pinsKey(conversationId: string | null) {
    return [...chatKeys.all, "pins", conversationId] as const;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the pinned messages for a conversation, newest-pinned first. */
export function usePins(conversationId: string | null) {
    return useQuery({
        queryKey: pinsKey(conversationId),
        enabled: !!conversationId,
        staleTime: 30_000,
        queryFn: async (): Promise<ChatPin[]> => {
            const { data, error } = await supabase
                .from("chat_pins")
                .select("message_id, pinned_at, message:chat_messages(id, body, sender_id, created_at, is_system)")
                .eq("conversation_id", conversationId!)
                .order("pinned_at", { ascending: false });
            if (error) throw error;
            return (data ?? []) as unknown as ChatPin[];
        },
    });
}

/**
 * Mutation: pin a message in the given conversation.
 * Inserts into `chat_pins` directly (RLS allows members).
 */
export function usePinMessage(conversationId: string | null) {
    const { user } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: string) => {
            const { error } = await supabase.from("chat_pins").insert({
                conversation_id: conversationId!,
                message_id: messageId,
                pinned_by: user!.id,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: pinsKey(conversationId) });
        },
    });
}

/**
 * Mutation: unpin a message in the given conversation.
 * Deletes from `chat_pins` directly (RLS allows members).
 */
export function useUnpinMessage(conversationId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: string) => {
            const { error } = await supabase
                .from("chat_pins")
                .delete()
                .eq("conversation_id", conversationId!)
                .eq("message_id", messageId);
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: pinsKey(conversationId) });
        },
    });
}
