// apps/platform/hooks/chat/use-conversations.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { ChatConversation, ChatMember } from "@/types/chat";

export const chatKeys = {
    all: ["chat"] as const,
    conversations: () => [...chatKeys.all, "conversations"] as const,
    archivedConversations: () => [...chatKeys.all, "conversations", "archived"] as const,
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

            // unread counts come from the chat_unread_counts RPC (accurate, server-side)
            const { data: unreadRows } = await supabase.rpc("chat_unread_counts");
            const unreadByConv = new Map<string, number>(
                ((unreadRows ?? []) as { conversation_id: string; unread: number }[]).map((r) => [
                    r.conversation_id,
                    r.unread,
                ])
            );

            return rows.map((r) => {
                const mine = r.members.find((m) => m.user_id === user!.id);
                return { ...r, my_last_read_at: mine?.last_read_at ?? null, unread: unreadByConv.get(r.id) ?? 0 };
            });
        },
    });
}

export function useArchivedConversations() {
    const { user } = useAuth();
    return useQuery({
        queryKey: chatKeys.archivedConversations(),
        enabled: !!user?.id,
        staleTime: 30_000,
        queryFn: async (): Promise<ConversationWithMeta[]> => {
            const { data: convs, error } = await supabase
                .from("chat_conversations")
                .select("*, members:chat_members(user_id,last_read_at,role)")
                .not("archived_at", "is", null)
                .order("archived_at", { ascending: false });
            if (error) throw error;

            const rows = (convs ?? []) as unknown as (ChatConversation & {
                members: Pick<ChatMember, "user_id" | "last_read_at" | "role">[];
            })[];

            return rows.map((r) => {
                const mine = r.members.find((m) => m.user_id === user!.id);
                return { ...r, my_last_read_at: mine?.last_read_at ?? null, unread: 0 };
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

export function useCreateChannel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { name: string; isPrivate: boolean; topic?: string | null }): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_create_channel", {
                p_name: args.name, p_is_private: args.isPrivate, p_topic: args.topic ?? null,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useCreateGroup() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { name: string; userIds: string[] }): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_create_group", {
                p_name: args.name, p_user_ids: args.userIds,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useRenameConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { conversationId: string; name: string; topic?: string | null }) => {
            const { error } = await supabase.rpc("chat_rename_conversation", {
                p_conversation_id: args.conversationId, p_name: args.name, p_topic: args.topic ?? null,
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useArchiveConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { conversationId: string; archived: boolean }) => {
            const { error } = await supabase.rpc("chat_archive_conversation", {
                p_conversation_id: args.conversationId, p_archived: args.archived,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            void qc.invalidateQueries({ queryKey: chatKeys.archivedConversations() });
        },
    });
}

export function useLeaveConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (conversationId: string) => {
            const { error } = await supabase.rpc("chat_leave_conversation", { p_conversation_id: conversationId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useDeleteConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (conversationId: string) => {
            const { error } = await supabase.rpc("chat_delete_conversation", { p_conversation_id: conversationId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}
