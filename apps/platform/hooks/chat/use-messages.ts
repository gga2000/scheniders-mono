// apps/platform/hooks/chat/use-messages.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";
import { dedupeMentions, dedupeReferences } from "@/lib/chat/parse-references";
import { resolveOwnEcho } from "@/lib/chat/own-echo";
import { diag } from "@/lib/diag";
import type { ChatMessage, ChatReference, ChatAttachment } from "@/types/chat";

const PAGE = 50;
const MESSAGE_SELECT =
    "*, references:chat_message_references(*), reactions:chat_message_reactions(*), attachments:chat_message_attachments(*)";

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
        // A refetch replaces the cache with the newest page only, which would
        // silently throw away any older history the user has scrolled back to
        // (and jump their viewport). Realtime keeps this list live, and a dropped
        // socket is reconciled by catchUp() below, so a focus refetch buys nothing.
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<ChatMessage[]> => {
            // Fetch the NEWEST page (desc + limit), then present ascending. Ordering
            // ascending + limit returned the OLDEST 50 and hid recent messages once a
            // conversation passed 50 messages.
            const { data, error } = await supabase
                .from("chat_messages")
                .select(MESSAGE_SELECT)
                .eq("conversation_id", conversationId!)
                .order("created_at", { ascending: false })
                .limit(PAGE);
            if (error) throw error;
            return ((data ?? []) as unknown as ChatMessage[]).reverse();
        },
    });

    // ── History pagination ───────────────────────────────────────────────────
    // The query above deliberately loads only the newest page. Without a way to
    // fetch older pages, every conversation was hard-capped at its last 50
    // messages: scrolling up hit a wall and a search hit older than that could
    // never be scrolled to. `exhausted` records, per conversation, that we have
    // reached the beginning of its history so we stop asking.
    const [exhausted, setExhausted] = useState<Record<string, boolean>>({});
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const loadingOlderRef = useRef(false);

    const rows = query.data;
    useEffect(() => {
        // A first page shorter than PAGE *is* the whole history.
        if (!conversationId || !rows) return;
        if (rows.length >= PAGE) return;
        setExhausted((prev) => (prev[conversationId] ? prev : { ...prev, [conversationId]: true }));
    }, [conversationId, rows]);

    const hasMore = conversationId ? !exhausted[conversationId] : false;

    const loadOlder = useCallback(async () => {
        if (!conversationId || loadingOlderRef.current) return;
        const current = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId)) ?? [];
        const oldest = current[0];
        if (!oldest) return;

        loadingOlderRef.current = true;
        setIsLoadingOlder(true);
        try {
            const { data, error } = await supabase
                .from("chat_messages")
                .select(MESSAGE_SELECT)
                .eq("conversation_id", conversationId)
                .lt("created_at", oldest.created_at)
                .order("created_at", { ascending: false })
                .limit(PAGE);
            if (error) throw error;

            const older = (data ?? []) as unknown as ChatMessage[];
            if (older.length < PAGE) {
                setExhausted((prev) => ({ ...prev, [conversationId]: true }));
            }
            if (older.length === 0) return;

            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
                const seen = new Set(old.map((m) => m.id));
                const fresh = older.filter((m) => !seen.has(m.id));
                if (fresh.length === 0) return old;
                return sortByCreated([...fresh, ...old]);
            });
        } catch (e) {
            diag.warn(`[chat] loadOlder failed conv=${conversationId}: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            loadingOlderRef.current = false;
            setIsLoadingOlder(false);
        }
    }, [conversationId, qc]);

    /**
     * Reconcile after the socket was down (tab backgrounded, network drop,
     * token-expiry CHANNEL_ERROR) by fetching everything NEWER than what we
     * hold and merging it in. Invalidating the query instead would refetch the
     * newest page and discard any older history already loaded.
     */
    const catchUp = useCallback(async () => {
        if (!conversationId) return;
        const current = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId)) ?? [];
        const newest = current[current.length - 1];
        if (!newest) {
            await qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
            return;
        }
        const { data, error } = await supabase
            .from("chat_messages")
            .select(MESSAGE_SELECT)
            .eq("conversation_id", conversationId)
            .gte("created_at", newest.created_at)
            .order("created_at", { ascending: true })
            .limit(200);
        if (error) {
            diag.warn(`[chat] catchUp failed conv=${conversationId}: ${error.message}`);
            return;
        }
        const missed = (data ?? []) as unknown as ChatMessage[];
        if (missed.length === 0) return;
        qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
            const byId = new Map(old.map((m) => [m.id, m]));
            let changed = false;
            for (const m of missed) {
                if (!byId.has(m.id)) changed = true;
                byId.set(m.id, m);
            }
            if (!changed) return old;
            // Drop optimistic placeholders that the server rows now supersede.
            const serverIds = new Set(missed.map((m) => m.client_msg_id).filter(Boolean));
            const merged = [...byId.values()].filter(
                (m) => !(m.id.startsWith("temp-") && m.client_msg_id && serverIds.has(m.client_msg_id))
            );
            return sortByCreated(merged);
        });
    }, [conversationId, qc]);

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

                // Our own echo. The optimistic + onSuccess path owns this row (it keeps
                // the references the composer attached), so we normally leave the cache
                // alone — but "leave it alone" has to be decided on the row's ID, not on
                // client_msg_id.
                //
                // The previous version matched purely on client_msg_id and then ran
                // `old.filter(m => m.id !== incoming.id)`. Once onSuccess had already
                // swapped the optimistic row's id from `temp-<clientMsgId>` to the real
                // one, that filter deleted the real, saved message — the message vanished
                // from the timeline and only came back on a refetch. Whether it hit
                // depended purely on whether the broadcast beat onSuccess, which is why it
                // looked intermittent.
                if (incoming.sender_id === myId) {
                    const key = chatKeys.messages(conversationId);
                    const current = qc.getQueryData<ChatMessage[]>(key) ?? [];
                    const action = resolveOwnEcho(current, incoming);

                    if (action === "append") {
                        // We sent this from a different tab or device, so there is no
                        // optimistic row here to own it. Hydrate and append, otherwise our
                        // own message would never show up in this session.
                        const { data } = await supabase
                            .from("chat_messages")
                            .select(MESSAGE_SELECT)
                            .eq("id", incoming.id)
                            .single();
                        const full = (data ?? incoming) as ChatMessage;
                        qc.setQueryData<ChatMessage[]>(key, (old = []) =>
                            old.some((m) => m.id === full.id) ? old : sortByCreated([...old, full])
                        );
                    } else if (action === "drop-bare") {
                        // Both a bare broadcast row and our optimistic placeholder are
                        // present: drop the bare one, the optimistic row owns the message.
                        qc.setQueryData<ChatMessage[]>(key, (old = []) =>
                            old.filter((m) => m.id !== incoming.id)
                        );
                    }
                    // Otherwise exactly one row already represents this message — leave it.
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
            .on("broadcast", { event: "conversation:update" }, () => {
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    // On a re-subscribe (after a drop) catch up on anything missed,
                    // merging rather than replacing so loaded history survives.
                    if (connectedOnce) void catchUp();
                    connectedOnce = true;
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(`[chat] messages channel ${status}${err ? ` ${err.message}` : ""} conv=${conversationId}`);
                }
            });
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, qc, myId, catchUp]);

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
        onError: (_e, vars, _ctx) => {
            // Keep the optimistic row visible but mark it failed so the UI can
            // offer a "Retry / Delete" affordance. The row is keyed by client_msg_id
            // so retrySend can find it and re-run the mutation (the RPC is idempotent).
            if (!conversationId) return;
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                old.map((m) =>
                    m.client_msg_id === vars.clientMsgId
                        ? { ...m, pending: false, failed: true }
                        : m
                )
            );
        },
        onSuccess: (saved, vars) => {
            if (!conversationId) return;
            // The RPC returns a NULL composite if the idempotency lookup misses, which
            // arrives here as null. Reading .client_msg_id off it would throw inside the
            // cache updater and leave the optimistic row stuck pending forever, so treat
            // it as a failed send and let the Retry affordance take over.
            if (!saved?.id) {
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                    old.map((m) =>
                        m.client_msg_id === vars.clientMsgId ? { ...m, pending: false, failed: true } : m
                    )
                );
                return;
            }
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
        if (!conversationId) return;
        await supabase.rpc("chat_mark_read", { p_conversation_id: conversationId });
        // The unread badge is computed by the chat_unread_counts RPC inside the
        // conversations query — without this the badge kept the stale count until
        // the 15s staleTime lapsed, so a thread you were actively reading still
        // showed as unread.
        await qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    };

    /**
     * Re-attempt sending a previously failed optimistic message.
     * Looks up the failed row by clientMsgId, clears its `failed` flag (marks
     * it pending again), then re-invokes the mutation reusing the same
     * clientMsgId — the `chat_send_message` RPC is idempotent on that key.
     */
    const retrySend = (clientMsgId: string) => {
        if (!conversationId) return;
        const messages = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId)) ?? [];
        const failed = messages.find((m) => m.client_msg_id === clientMsgId && m.failed);
        if (!failed) return;
        // Reset flag so the UI shows it as pending while the retry is in flight
        qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
            old.map((m) =>
                m.client_msg_id === clientMsgId ? { ...m, pending: true, failed: false } : m
            )
        );
        sendMessage.mutate({
            body: failed.body,
            references: failed.references,
            attachments: failed.attachments,
            replyToId: failed.reply_to_id,
            clientMsgId,
        });
    };

    return { ...query, sendMessage, markRead, retrySend, loadOlder, hasMore, isLoadingOlder };
}
