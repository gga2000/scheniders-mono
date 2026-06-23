// apps/platform/components/chat/pinned-bar.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pin, X } from "lucide-react";
import { usePins, useUnpinMessage } from "@/hooks/chat/use-pins";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";

interface PinnedBarProps {
    conversationId: string;
}

export function PinnedBar({ conversationId }: PinnedBarProps) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const { data: pins = [] } = usePins(conversationId);
    const unpinMessage = useUnpinMessage(conversationId);
    const openMessage = useChatStore((s) => s.openMessage);

    if (pins.length === 0) return null;

    const handleJump = (messageId: string) => {
        openMessage(conversationId, messageId);
    };

    const handleUnpin = (e: React.MouseEvent, messageId: string) => {
        e.stopPropagation();
        unpinMessage.mutate(messageId);
    };

    const visiblePins = expanded ? pins : pins.slice(0, 1);

    return (
        <div className="shrink-0 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
            {/* Header row */}
            <div className="flex items-center gap-2 px-4 py-2">
                <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-[12px] font-semibold text-foreground">
                    {t("chat.pinnedMessages", "Pinned")}
                    <span className="ml-1 text-muted-foreground">({pins.length})</span>
                </span>
                {pins.length > 1 && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        aria-label={expanded ? t("chat.collapsePins", "Collapse pins") : t("chat.expandPins", "Expand pins")}
                        className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                        {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                    </button>
                )}
            </div>

            {/* Pin rows */}
            <div className="pb-1">
                {visiblePins.map((pin) => {
                    const body = pin.message?.body;
                    const preview = body
                        ? body.length > 80
                            ? body.slice(0, 80) + "…"
                            : body
                        : t("chat.attachment", "Attachment");

                    return (
                        <div
                            key={pin.message_id}
                            className="group flex items-center gap-2 px-4 py-1.5"
                        >
                            <button
                                type="button"
                                onClick={() => handleJump(pin.message_id)}
                                className="min-w-0 flex-1 text-left"
                            >
                                <span className="block truncate text-[12px] text-foreground/80 transition-colors hover:text-foreground">
                                    {preview}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleUnpin(e, pin.message_id)}
                                aria-label={t("chat.unpin", "Unpin")}
                                disabled={unpinMessage.isPending}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
