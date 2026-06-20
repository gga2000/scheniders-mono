// apps/platform/hooks/chat/use-conversations.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { ChatConversation, ChatMember } from "@/types/chat";

export const chatKeys = {
    all: ["chat"] as const,
    conversations: () => [...chatKeys.all, "conversations"] as const,
    messages: (conversationId: string) => [...chatKeys.all, "messages", conversationId] as const,
    mentions: () => [...chatKeys.all, "mentions"] as const,
};

export interface ConversationWithMeta extends ChatConversation {
    members: Pick<ChatMember, "user_id" | "last_read_at" | "role">[];
    my_last_read_at: string | null;
    unread: number;
}

export function useConversations() {
    const { user } = useAuth();
    return useQuery({
        queryKey: chatKeys.conversations(),
        enabled: !!user?.id,
        staleTime: 15_000,
        queryFn: async (): Promise<ConversationWithMeta[]> => {
            const { data: convs, error } = await supabase
                .from("chat_conversations")
                .select("*, members:chat_members(user_id,last_read_at,role)")
                .is("archived_at", null)
                .order("last_message_at", { ascending: false, nullsFirst: false });
            if (error) throw error;

            const rows = (convs ?? []) as unknown as (ChatConversation & {
                members: Pick<ChatMember, "user_id" | "last_read_at" | "role">[];
            })[];

            // unread = messages newer than my last_read_at (one count query per conv batched)
            const ids = rows.map((r) => r.id);
            const unreadByConv = new Map<string, number>();
            if (ids.length) {
                // fetch only created_at + conversation_id of recent messages, count client-side
                const { data: recent } = await supabase
                    .from("chat_messages")
                    .select("conversation_id, created_at")
                    .in("conversation_id", ids)
                    .is("deleted_at", null)
                    .order("created_at", { ascending: false })
                    .limit(500);
                for (const r of rows) {
                    const mine = r.members.find((m) => m.user_id === user!.id);
                    const lastRead = mine?.last_read_at ? new Date(mine.last_read_at).getTime() : 0;
                    const count = (recent ?? []).filter(
                        (m) => m.conversation_id === r.id && new Date(m.created_at).getTime() > lastRead
                    ).length;
                    unreadByConv.set(r.id, count);
                }
            }

            return rows.map((r) => {
                const mine = r.members.find((m) => m.user_id === user!.id);
                return { ...r, my_last_read_at: mine?.last_read_at ?? null, unread: unreadByConv.get(r.id) ?? 0 };
            });
        },
    });
}

export function useStartDm() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (otherUserId: string): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_find_or_create_dm", { p_other_user_id: otherUserId });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useStartOrderConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (orderId: string): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_find_or_create_order_conversation", { p_order_id: orderId });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}
