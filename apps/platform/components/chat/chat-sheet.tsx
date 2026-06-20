// apps/platform/components/chat/chat-sheet.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useChatStore } from "@/store/use-chat-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMessages } from "@/hooks/chat/use-messages";
import { useTypingIndicator } from "@/hooks/chat/use-typing-indicator";
import { ConversationList } from "./conversation-list";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

export function ChatSheet() {
    const { isOpen, close, activeConversationId } = useChatStore();
    const isMobile = useIsMobile(768);
    const { data: messages = [], sendMessage, markRead } = useMessages(activeConversationId);
    const { typers, notifyTyping } = useTypingIndicator(activeConversationId);

    // Mark read on open / conversation switch only — not on every incoming
    // message (that re-fired markRead per message and churned the unread RPC).
    useEffect(() => { if (isOpen && activeConversationId) void markRead(); }, [isOpen, activeConversationId]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div className="fixed inset-0 z-40 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
                    <motion.aside
                        className={`fixed z-50 flex flex-col bg-[var(--background)] shadow-2xl ${isMobile ? "inset-0" : "right-0 top-0 h-full w-[640px]"}`}
                        initial={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        animate={{ x: 0, opacity: 1 }} exit={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    >
                        <div className="flex items-center justify-between border-b px-3 py-2">
                            <span className="font-semibold">Team chat</span>
                            <button onClick={close} className="rounded-full p-1 hover:bg-black/5">✕</button>
                        </div>
                        <div className="flex min-h-0 flex-1">
                            {!isMobile && <ConversationList />}
                            <div className="flex min-w-0 flex-1 flex-col">
                                {activeConversationId ? (
                                    <>
                                        <MessageList messages={messages} />
                                        {typers.length > 0 && (
                                            <div className="px-4 py-1 text-xs italic text-muted-foreground">
                                                {typers.map((t) => t.display_name).join(", ")} typing…
                                            </div>
                                        )}
                                        <Composer
                                            conversationId={activeConversationId}
                                            onTyping={notifyTyping}
                                            onSend={(a) => sendMessage.mutate(a)}
                                        />
                                    </>
                                ) : (
                                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Pick a conversation</div>
                                )}
                            </div>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
