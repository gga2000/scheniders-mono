// apps/platform/hooks/chat/use-messages.ts
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";
import { dedupeMentions, dedupeReferences } from "@/lib/chat/parse-references";
import type { ChatMessage, ChatReference, ChatAttachment } from "@/types/chat";

const PAGE = 50;

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: conversationId ? chatKeys.messages(conversationId) : ["chat", "messages", "none"],
        enabled: !!conversationId,
        staleTime: 10_000,
        queryFn: async (): Promise<ChatMessage[]> => {
            const { data, error } = await supabase
                .from("chat_messages")
                .select("*, references:chat_message_references(*), reactions:chat_message_reactions(*), attachments:chat_message_attachments(*)")
                .eq("conversation_id", conversationId!)
                .order("created_at", { ascending: true })
                .limit(PAGE);
            if (error) throw error;
            return (data ?? []) as unknown as ChatMessage[];
        },
    });

    // realtime: subscribe to the private conversation topic for new/updated messages
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase.channel(conversationTopic(conversationId), { config: { private: true } });
        channel
            .on("broadcast", { event: "message:new" }, async ({ payload }) => {
                const incoming = payload as ChatMessage;

                // our own echo: the optimistic + onSuccess path owns our row (it keeps the
                // references the composer attached). Do NOT append from the broadcast. We only
                // guard against a duplicate already present under the broadcast's id while the
                // optimistic row (keyed by client_msg_id) still lives.
                if (incoming.sender_id === user?.id) {
                    qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
                        const hasOptimistic = old.some(
                            (m) => m.client_msg_id && m.client_msg_id === incoming.client_msg_id
                        );
                        // if our optimistic/saved row exists, strip any stray bare broadcast row
                        if (hasOptimistic) return old.filter((m) => m.id !== incoming.id);
                        return old;
                    });
                    qc.invalidateQueries({ queryKey: chatKeys.conversations() });
                    return;
                }

                // someone else's message: the broadcast has no children, so hydrate the full row.
                const { data } = await supabase
                    .from("chat_messages")
                    .select("*, references:chat_message_references(*), reactions:chat_message_reactions(*), attachments:chat_message_attachments(*)")
                    .eq("id", incoming.id).single();
                const full = (data ?? incoming) as ChatMessage;
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
                    // dedupe purely on client_msg_id, then on id
                    const withoutOptimistic = old.filter(
                        (m) => !(m.client_msg_id && m.client_msg_id === full.client_msg_id)
                    );
                    if (withoutOptimistic.some((m) => m.id === full.id)) {
                        return withoutOptimistic.map((m) => (m.id === full.id ? full : m));
                    }
                    return [...withoutOptimistic, full];
                });
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .on("broadcast", { event: "message:update" }, ({ payload }) => {
                const upd = payload as ChatMessage;
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                    old.map((m) => (m.id === upd.id ? { ...m, ...upd } : m))
                );
            })
            .on("broadcast", { event: "reaction:update" }, async ({ payload }) => {
                const messageId = (payload as { message_id: string }).message_id;
                const { data } = await supabase.from("chat_message_reactions").select("*").eq("message_id", messageId);
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId!), (old = []) =>
                    old.map((m) => (m.id === messageId ? { ...m, reactions: (data ?? m.reactions) as ChatMessage["reactions"] } : m)));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, qc]);

    const sendMessage = useMutation({
        mutationFn: async (args: {
            body: string; references?: ChatReference[]; mentions?: string[];
            attachments?: ChatAttachment[]; replyToId?: string | null; clientMsgId: string;
        }) => {
            const { data, error } = await supabase.rpc("chat_send_message", {
                p_conversation_id: conversationId!,
                p_body: args.body,
                p_client_msg_id: args.clientMsgId,
                p_reply_to_id: args.replyToId ?? null,
                p_references: dedupeReferences(args.references ?? []),
                p_mentions: dedupeMentions(args.mentions ?? []),
                p_attachments: args.attachments ?? [],
            });
            if (error) throw error;
            return data as ChatMessage;
        },
        onMutate: async (args) => {
            if (!conversationId) return;
            await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
            const previous = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId));
            const optimistic: ChatMessage = {
                id: `temp-${args.clientMsgId}`, conversation_id: conversationId, tenant_id: "",
                sender_id: user!.id, body: args.body, reply_to_id: args.replyToId ?? null,
                client_msg_id: args.clientMsgId, edited_at: null, deleted_at: null,
                created_at: new Date().toISOString(), references: args.references ?? [],
                reactions: [], attachments: args.attachments ?? [], pending: true,
            };
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => [...old, optimistic]);
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (conversationId && ctx?.previous) qc.setQueryData(chatKeys.messages(conversationId), ctx.previous);
        },
        onSuccess: (saved) => {
            if (!conversationId) return;
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                old.map((m) =>
                    m.client_msg_id === saved.client_msg_id
                        ? {
                              ...saved,
                              pending: false,
                              // RPC return has no children; keep the optimistic ones the composer attached
                              references: m.references,
                              reactions: m.reactions,
                              attachments: m.attachments,
                          }
                        : m
                )
            );
        },
    });

    const markRead = async () => {
        if (conversationId) await supabase.rpc("chat_mark_read", { p_conversation_id: conversationId });
    };

    return { ...query, sendMessage, markRead };
}
