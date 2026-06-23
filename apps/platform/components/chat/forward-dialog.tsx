// apps/platform/components/chat/forward-dialog.tsx
"use client";

import { useMemo, useState } from "react";
import { Hash, AtSign, Package } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/hooks/chat/use-conversations";
import { fuzzyRank } from "@/lib/chat/fuzzy";
import { dedupeReferences } from "@/lib/chat/parse-references";
import { useAuth } from "@/hooks/use-auth";
import type { ChatMessage } from "@/types/chat";

function ConvIcon({ kind }: { kind: string }) {
    if (kind === "channel") return <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    if (kind === "order") return <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    return <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

interface ForwardDialogProps {
    message: ChatMessage | null;
    onClose: () => void;
}

export function ForwardDialog({ message, onClose }: ForwardDialogProps) {
    const { t } = useLanguage();
    const { user } = useAuth();
    const qc = useQueryClient();
    const [query, setQuery] = useState("");
    const [pending, setPending] = useState(false);

    const { data: conversations = [] } = useConversations();

    // Build a fuzzy-rankable list of non-archived conversations, excluding the
    // source conversation so you can't forward a message to itself.
    const candidates = useMemo(() => {
        return conversations
            .filter((c) => !c.archived_at && c.id !== message?.conversation_id)
            .map((c) => ({ conv: c, label: c.name ?? t("chat.directMessage", "Direct message") }));
    }, [conversations, message?.conversation_id, t]);

    const ranked = useMemo(
        () => fuzzyRank(candidates, query, (c) => c.label),
        [candidates, query],
    );

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setQuery("");
            onClose();
        }
    };

    const handleSelect = async (targetConversationId: string) => {
        if (!message || !user || pending) return;
        setPending(true);
        try {
            // Generate a fresh client_msg_id — the RPC is idempotent on this key,
            // so a new UUID correctly creates a distinct forwarded copy.
            const clientMsgId = crypto.randomUUID();

            // Map references: keep ref_type, ref_id, snapshot (drop server-only id/message_id).
            const mappedRefs = dedupeReferences(
                (message.references ?? []).map(({ ref_type, ref_id, snapshot }) => ({
                    ref_type,
                    ref_id,
                    snapshot,
                }))
            );

            const { error } = await supabase.rpc("chat_send_message", {
                p_conversation_id: targetConversationId,
                p_body: message.body,
                p_client_msg_id: clientMsgId,
                p_reply_to_id: null,
                p_references: mappedRefs,
                p_mentions: [],
                p_attachments: [],
            });

            if (error) throw error;

            // Refresh the conversations list + the target's messages if they're cached.
            void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            void qc.invalidateQueries({ queryKey: chatKeys.messages(targetConversationId) });

            toast.success(t("chat.forwardSuccess", "Forwarded"));
            setQuery("");
            onClose();
        } catch {
            toast.error(t("chat.forwardFailed", "Couldn't forward message"));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={message !== null} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-sm border-(--card-border) bg-(--card-bg) p-0 shadow-xl">
                <DialogHeader className="sr-only">
                    <DialogTitle>{t("chat.forwardTo", "Forward to…")}</DialogTitle>
                </DialogHeader>

                {/* Search input */}
                <div className="border-b border-(--card-border) px-4 py-3">
                    <p className="mb-2 text-[13px] font-semibold text-foreground">
                        {t("chat.forwardTo", "Forward to…")}
                    </p>
                    <input
                        autoFocus
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("chat.forwardPlaceholder", "Search conversations…")}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        disabled={pending}
                    />
                </div>

                {/* Results */}
                <div className="max-h-72 overflow-y-auto py-1">
                    {ranked.length === 0 ? (
                        <p className="px-4 py-3 text-center text-sm text-muted-foreground">
                            {t("chat.jumpToEmpty", "No matches")}
                        </p>
                    ) : (
                        ranked.map(({ conv, label }) => (
                            <button
                                key={conv.id}
                                type="button"
                                onClick={() => void handleSelect(conv.id)}
                                disabled={pending}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                            >
                                <ConvIcon kind={conv.kind} />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                            </button>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
