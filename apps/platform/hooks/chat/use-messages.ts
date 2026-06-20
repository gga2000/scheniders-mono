// apps/platform/hooks/chat/use-messages.ts
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";
import { dedupeMentions, dedupeReferences } from "@/lib/chat/parse-references";
import { diag } from "@/lib/diag";
import type { ChatMessage, ChatReference, ChatAttachment } from "@/types/chat";

const PAGE = 50;

/** Ascending by created_at, with a stable id tiebreaker for equal timestamps. */
function sortByCreated(rows: ChatMessage[]): ChatMessage[] {
    return [...rows].sort((a, b) => {
        if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1;
        return a.created_at < b.created_at ? -1 : 1;
    });
}

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: conversationId ? chatKeys.messages(conversationId) : ["chat", "messages", "none"],
        enabled: !!conversationId,
        staleTime: 10_000,
        queryFn: async (): Promise<ChatMessage[]> => {
            // Fetch the NEWEST page (desc + limit), then present ascending. Ordering
            // ascending + limit returned the OLDEST 50 and hid recent messages once a
            // conversation passed 50 messages.
            const { data, error } = await supabase
                .from("chat_messages")
                .select("*, references:chat_message_references(*), reactions:chat_message_reactions(*), attachments:chat_message_attachments(*)")
                .eq("conversation_id", conversationId!)
                .order("created_at", { ascending: false })
                .limit(PAGE);
            if (error) throw error;
            return ((data ?? []) as unknown as ChatMessage[]).reverse();
        },
    });

    // realtime: subscribe to the private conversation topic for new/updated messages
    const myId = user?.id;
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase.channel(conversationTopic(conversationId), { config: { private: true } });
        // Track reconnects so we can catch up on messages missed while the socket
        // was down (tab backgrounded, network drop, token-expiry CHANNEL_ERROR).
        let connectedOnce = false;
        channel
            .on("broadcast", { event: "message:new" }, async ({ payload }) => {
                const incoming = payload as ChatMessage;

                // our own echo: the optimistic + onSuccess path owns our row (it keeps the
                // references the composer attached). Do NOT append from the broadcast. We only
                // guard against a duplicate already present under the broadcast's id while the
                // optimistic row (keyed by client_msg_id) still lives.
                if (incoming.sender_id === myId) {
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
                    // Re-sort: concurrent hydration awaits can resolve out of order, so
                    // don't blind-append to the tail.
                    return sortByCreated([...withoutOptimistic, full]);
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
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    // On a re-subscribe (after a drop) catch up on anything missed.
                    if (connectedOnce) qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
                    connectedOnce = true;
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(`[chat] messages channel ${status}${err ? ` ${err.message}` : ""} conv=${conversationId}`);
                }
            });
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, qc, myId]);

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
        onSuccess: (saved, vars) => {
            if (!conversationId) return;
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
                const match = old.find((m) => m.client_msg_id === saved.client_msg_id);
                if (!match) {
                    // The optimistic row was already removed (e.g. a refetch landed, or
                    // this was an idempotent retry). Don't drop the message — append it,
                    // unless an identical id is already present.
                    if (old.some((m) => m.id === saved.id)) return old;
                    return sortByCreated([
                        ...old,
                        { ...saved, pending: false, references: vars.references ?? [], reactions: [], attachments: vars.attachments ?? [] },
                    ]);
                }
                return old.map((m) =>
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
                );
            });
        },
    });

    const markRead = async () => {
        if (conversationId) await supabase.rpc("chat_mark_read", { p_conversation_id: conversationId });
    };

    return { ...query, sendMessage, markRead };
}
