// apps/platform/hooks/chat/use-message-edits.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "./use-conversations";

export interface MessageEdit {
    id: string;
    prev_body: string;
    edited_at: string;
}

/**
 * Earlier versions of one message, newest first.
 *
 * `chat_message_edits` is written by the `trg_chat_capture_edit` trigger on
 * `chat_messages` (one row with the OLD body per body change) and is readable
 * only by members of the message's conversation (RLS via `chat_is_member`).
 *
 * `enabled` should be true only while the history dialog is open, so the
 * query runs on demand rather than once per rendered message.
 */
export function useMessageEdits(messageId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: [...chatKeys.all, "edits", messageId] as const,
        enabled: enabled && messageId !== null,
        queryFn: async (): Promise<MessageEdit[]> => {
            if (messageId === null) return [];
            const { data, error } = await supabase
                .from("chat_message_edits")
                .select("id, prev_body, edited_at")
                .eq("message_id", messageId)
                .order("edited_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },
    });
}
