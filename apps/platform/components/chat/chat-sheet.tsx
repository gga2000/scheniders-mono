// apps/platform/components/chat/chat-sheet.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { ChevronLeft, MessageSquare, X } from "lucide-react";
import { useChatStore } from "@/store/use-chat-store";
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
    const { data: messages = [], sendMessage, markRead } = useMessages(activeConversationId);
    const { typers, notifyTyping } = useTypingIndicator(activeConversationId);

    // Mark read on open / conversation switch only — not on every incoming
    // message (that re-fired markRead per message and churned the unread RPC).
    useEffect(() => { if (isOpen && activeConversationId) void markRead(); }, [isOpen, activeConversationId]);

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
                    <motion.aside
                        className={`fixed z-50 flex flex-col overflow-hidden bg-[var(--background)] shadow-2xl ${
                            isMobile
                                ? "inset-0"
                                : "right-0 top-0 h-full w-[640px] rounded-l-2xl border-l border-[var(--card-border)]"
                        }`}
                        initial={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5">
                            {showMobileBack ? (
                                <button
                                    onClick={() => setActiveConversation(null)}
                                    className="-ml-1 flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 active:scale-95"
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
                                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground active:scale-95"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex min-h-0 flex-1">
                            {!isMobile && <ConversationList />}
                            <div className="flex min-w-0 flex-1 flex-col bg-[var(--background)]">
                                {activeConversationId ? (
                                    <>
                                        <MessageList messages={messages} />
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
                                            onSend={(a) => sendMessage.mutate(a)}
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
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
