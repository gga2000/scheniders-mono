"use client";
import { MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";

export function ChatTrigger() {
    const { data: conversations = [] } = useConversations();
    const total = conversations.reduce((n, c) => n + c.unread, 0);
    const open = useChatStore((s) => s.open);
    const { t } = useLanguage();
    return (
        <button
            onClick={() => open()}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-muted transition-all hover:border-[var(--foreground-muted)] hover:text-foreground active:scale-95"
            title={t("chat.trigger.title", "Team chat")}
            aria-label={t("chat.trigger.title", "Team chat")}
        >
            <MessageSquare className="h-5 w-5" />
            {total > 0 && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-lg"
                >
                    {total > 99 ? "99+" : total}
                </motion.span>
            )}
        </button>
    );
}
