// apps/platform/components/chat/chat-sheet.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MessageSquare, X } from "lucide-react";
import { useChatStore } from "@/store/use-chat-store";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useAuth } from "@/hooks/use-auth";
import { firstUnreadMessageId } from "@/lib/chat/unread";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMessages } from "@/hooks/chat/use-messages";
import { useTypingIndicator } from "@/hooks/chat/use-typing-indicator";
import { useLanguage } from "@/components/providers/language-provider";
import { ConversationList } from "./conversation-list";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

export function ChatSheet() {
    const { isOpen, close, activeConversationId, setActiveConversation } = useChatStore();
    const isMobile = useIsMobile(768);
    const { t } = useLanguage();
    const { data: messages = [], sendMessage, markRead, isLoading } = useMessages(activeConversationId);
    const { typers, notifyTyping } = useTypingIndicator(activeConversationId);

    const { user } = useAuth();
    const { data: conversations = [] } = useConversations();

    // Mark read on open / conversation switch only — not on every incoming
    // message (that re-fired markRead per message and churned the unread RPC).
    useEffect(() => { if (isOpen && activeConversationId) void markRead(); }, [isOpen, activeConversationId]);

    // Freeze my_last_read_at per conversation at open, BEFORE markRead advances it,
    // so the divider boundary doesn't jump while you read. Cleared when the sheet closes.
    const frozenLastRead = useRef<Record<string, string | null>>({});
    // Bumped when a freeze lands so firstUnreadId recomputes even though the ref
    // mutation is invisible to React — covers the cold-start race where the
    // conversations query resolves AFTER messages (otherwise the divider never shows).
    const [frozenVersion, setFrozenVersion] = useState(0);
    useEffect(() => {
        if (!isOpen) {
            frozenLastRead.current = {};
            return;
        }
        if (!activeConversationId || activeConversationId in frozenLastRead.current) return;
        const conv = conversations.find((c) => c.id === activeConversationId);
        if (conv) {
            frozenLastRead.current[activeConversationId] = conv.my_last_read_at;
            setFrozenVersion((v) => v + 1);
        }
    }, [isOpen, activeConversationId, conversations]);

    const firstUnreadId = useMemo(
        () =>
            activeConversationId && user
                ? firstUnreadMessageId(messages, frozenLastRead.current[activeConversationId] ?? null, user.id)
                : null,
        [messages, activeConversationId, user, frozenVersion]
    );

    // On mobile the list is hidden inside a conversation, so offer a back
    // affordance that clears the active conversation to reveal the list again.
    const showMobileBack = isMobile && activeConversationId !== null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    {/* Centering wrapper is non-interactive so clicks on the empty
                        padding fall through to the backdrop above (which closes). */}
                    <div
                        className={`pointer-events-none fixed inset-0 z-50 flex ${
                            isMobile ? "p-0" : "items-center justify-center p-4"
                        }`}
                    >
                    <motion.aside
                        className={`pointer-events-auto flex flex-col overflow-hidden bg-[var(--background)] shadow-2xl ${
                            isMobile
                                ? "h-full w-full"
                                : "h-[min(680px,86vh)] w-[min(960px,94vw)] rounded-2xl border border-[var(--card-border)]"
                        }`}
                        initial={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: "spring", damping: 30, stiffness: 320 }}
                    >
                        {/* Header */}
                        <div
                            className="flex shrink-0 items-center gap-2 border-b border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5"
                            style={isMobile ? { paddingTop: "calc(0.625rem + var(--safe-area-top, 0px))" } : undefined}
                        >
                            {showMobileBack ? (
                                <button
                                    onClick={() => setActiveConversation(null)}
                                    className="-ml-1 flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 active:scale-95"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    {t("chat.back", "Conversations")}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pastel-yellow)] text-[var(--ink)]">
                                        <MessageSquare className="h-4 w-4" />
                                    </span>
                                    <span className="font-semibold text-foreground">{t("chat.title", "Team chat")}</span>
                                </div>
                            )}
                            <button
                                onClick={close}
                                aria-label={t("chat.close", "Close chat")}
                                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground active:scale-95"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex min-h-0 flex-1">
                            {/* Desktop: list is always the sidebar. Mobile: list takes over
                                when no conversation is active (so you can pick/start one). */}
                            {(!isMobile || !activeConversationId) && <ConversationList />}
                            {(!isMobile || activeConversationId) && (
                            <div className="flex min-w-0 flex-1 flex-col bg-[var(--background)]">
                                {activeConversationId ? (
                                    <>
                                        <MessageList messages={messages} loading={isLoading} firstUnreadId={firstUnreadId} />
                                        <AnimatePresence>
                                            {typers.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs italic text-muted-foreground"
                                                >
                                                    <span className="flex gap-0.5">
                                                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
                                                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
                                                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                                                    </span>
                                                    {typers.map((t) => t.display_name).join(", ")} {t("chat.typingSuffix", "typing…")}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        <Composer
                                            conversationId={activeConversationId}
                                            onTyping={notifyTyping}
                                            onSend={(a) => sendMessage.mutateAsync(a)}
                                        />
                                    </>
                                ) : (
                                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-bg)] text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                                            <MessageSquare className="h-6 w-6" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">
                                                {t("chat.pickConversation", "Pick a conversation")}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {t("chat.pickConversationDesc", "Choose a channel or teammate to start chatting.")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    </motion.aside>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
