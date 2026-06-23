// apps/platform/hooks/chat/use-message-edits.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "@/hooks/chat/use-conversations";

export interface MessageEdit {
    id: string;
    prev_body: string;
    edited_at: string;
}

/**
 * Lazy query over `chat_message_edits` for a given message.
 *
 * The underlying table is created by the Phase-3 migration
 * (20260623100000_chat_message_edits.sql). The hook compiles regardless of
 * whether the migration has been applied — calling `.from` on a table that
 * isn't in the generated-type snapshot requires us to cast through `unknown`
 * (the table name is valid SQL but simply not yet reflected in
 * `database.types.ts`). On error the hook returns [] so the dialog degrades
 * gracefully to an empty state until the migration runs.
 *
 * `enabled` should be true only when the history dialog is open.
 */
export function useMessageEdits(messageId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: [...chatKeys.all, "edits", messageId] as const,
        enabled: enabled && !!messageId,
        queryFn: async (): Promise<MessageEdit[]> => {
            if (!messageId) return [];

            // `chat_message_edits` is not yet in the generated DB type snapshot
            // (migration is drafted but pending). We escape the type system via
            // `unknown` so this compiles without `any` or `@ts-ignore`.
            type AnyClient = { from: (table: string) => AnyBuilder };
            type AnyBuilder = {
                select: (cols: string) => AnyBuilder;
                eq: (col: string, val: string) => AnyBuilder;
                order: (col: string, opts: { ascending: boolean }) => Promise<{
                    data: MessageEdit[] | null;
                    error: { message: string } | null;
                }>;
            };

            const { data, error } = await (supabase as unknown as AnyClient)
                .from("chat_message_edits")
                .select("id, prev_body, edited_at")
                .eq("message_id", messageId)
                .order("edited_at", { ascending: false });

            if (error) {
                // Degrade silently — table may not exist until migration is applied.
                return [];
            }
            return data ?? [];
        },
    });
}
