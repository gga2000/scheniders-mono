// apps/platform/hooks/chat/use-conversation-members.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "./use-conversations";

export interface ConversationMember {
    user_id: string;
    role: "owner" | "member";
    display_name: string;
    avatar_url: string | null;
}

export function useConversationMembers(conversationId: string | null) {
    return useQuery({
        queryKey: [...chatKeys.all, "members", conversationId] as const,
        enabled: !!conversationId,
        staleTime: 15_000,
        queryFn: async (): Promise<ConversationMember[]> => {
            const { data, error } = await supabase
                .from("chat_members")
                .select("user_id, role, profile:user_profiles(display_name, avatar_url)")
                .eq("conversation_id", conversationId!);
            if (error) throw error;
            type Row = { user_id: string; role: "owner" | "member"; profile: { display_name: string | null; avatar_url: string | null } | null };
            return ((data ?? []) as unknown as Row[]).map((r) => ({
                user_id: r.user_id,
                role: r.role,
                display_name: r.profile?.display_name ?? "Teammate",
                avatar_url: r.profile?.avatar_url ?? null,
            }));
        },
    });
}

const membersKey = (conversationId: string) => [...chatKeys.all, "members", conversationId] as const;

export function useAddMembers(conversationId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (userIds: string[]) => {
            const { error } = await supabase.rpc("chat_add_members", { p_conversation_id: conversationId, p_user_ids: userIds });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: membersKey(conversationId) });
            qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}

export function useRemoveMember(conversationId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (userId: string) => {
            const { error } = await supabase.rpc("chat_remove_member", { p_conversation_id: conversationId, p_user_id: userId });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: membersKey(conversationId) });
            qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}
