// apps/platform/components/chat/message-item.tsx
"use client";
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChatAvatar } from "./chat-avatar";
import { formatDistanceToNow } from "date-fns";
import { FileText, Paperclip } from "lucide-react";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/components/providers/language-provider";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import type { PipelineStageId } from "@/lib/order-pipeline";
import type { ChatMessage, ChatSystemEvent } from "@/types/chat";

/** Image attachments use the paperclip glyph; other files a document glyph. */
function isImage(mime: string | null | undefined): boolean {
    return !!mime && mime.startsWith("image/");
}

/** Resolve a localized status label from the pipeline registry, falling back to the raw value. */
function statusLabel(status: string, t: (key: string, fallback: string) => string): string {
    const meta = PIPELINE_STAGE_REGISTRY[status as PipelineStageId];
    if (meta) return t(meta.labelKey, meta.fallback);
    return status;
}

/** Centered muted pill rendered for system-generated events (no avatar, no bubble). */
function SystemEventPill({ event, t, memberMap }: {
    event: ChatSystemEvent;
    t: (key: string, fallback: string, params?: Record<string, string>) => string;
    memberMap: Map<string, { display_name: string }>;
}) {
    let text: string;

    if (event.type === "status_changed") {
        const actor = event.actor_name ?? t("chat.system", "System");
        const toLabel = statusLabel(event.to, t);
        text = t("chat.event.statusChanged", "{actor} changed status to {to}", { actor, to: toLabel });
    } else if (event.type === "assigned") {
        const actor = event.actor_name ?? t("chat.system", "System");
        if (event.to === null) {
            text = t("chat.event.unassigned", "{actor} unassigned this", { actor });
        } else {
            const who = memberMap.get(event.to)?.display_name ?? t("chat.teammate", "Teammate");
            text = t("chat.event.assigned", "{actor} assigned this to {who}", { actor, who });
        }
    } else {
        // delivered
        text = t("chat.event.delivered", "Order delivered");
    }

    return (
        <div className="flex items-center justify-center px-4 py-1">
            <span className="inline-flex items-center rounded-full bg-(--pastel-mint)/60 px-3 py-0.5 text-[11px] text-muted-foreground ring-1 ring-(--card-border)">
                {text}
            </span>
        </div>
    );
}

export function MessageItem({
    message,
    senderName,
    senderAvatar,
}: {
    message: ChatMessage;
    senderName: string;
    senderAvatar?: string | null;
}) {
    const { t } = useLanguage();
    const reduceMotion = useReducedMotion();
    const { data: members } = useTenantMembers();

    // Memoized member map for resolving assignee display names in system events.
    // The same query data is already cached (MessageList uses it too), so this
    // only recomputes when the members list actually changes.
    const memberMap = useMemo(
        () => new Map<string, { display_name: string }>(
            (members ?? []).map((m) => [m.user_id, { display_name: m.display_name }])
        ),
        [members]
    );

    // System events render as a centered muted pill — no avatar, no bubble.
    if (message.is_system && message.system_event) {
        return (
            <SystemEventPill
                event={message.system_event}
                t={t}
                memberMap={memberMap}
            />
        );
    }

    if (message.deleted_at) {
        return (
            <div className="px-4 py-1.5 text-xs italic text-muted-foreground">
                {t("chat.messageDeleted", "Message deleted")}
            </div>
        );
    }
    const openAttachment = async (storagePath: string) => {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(storagePath, 60);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    };
    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`group relative flex gap-2.5 px-4 py-1.5 transition-colors hover:bg-black/[0.025] ${
                message.pending ? "opacity-60" : ""
            }`}
        >
            <ChatAvatar userId={message.sender_id ?? ""} name={senderName} avatarUrl={senderAvatar} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{senderName}</span>
                    <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </span>
                    {message.edited_at && (
                        <span className="text-[10px] text-muted-foreground/80">({t("chat.edited", "edited")})</span>
                    )}
                </div>
                {message.body && (
                    <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground/90">
                        {message.body}
                    </div>
                )}
                {(message.references ?? []).map((r, i) => (
                    <ReferenceCard key={i} reference={r} />
                ))}
                {(message.attachments ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(message.attachments ?? []).map((a, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => openAttachment(a.storage_path)}
                                className="inline-flex max-w-[220px] items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                            >
                                {isImage(a.mime) ? (
                                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate">{a.file_name}</span>
                            </button>
                        ))}
                    </div>
                )}
                {!message.pending && (
                    <ReactionBar
                        messageId={message.id}
                        conversationId={message.conversation_id}
                        reactions={message.reactions ?? []}
                    />
                )}
            </div>
        </motion.div>
    );
}
