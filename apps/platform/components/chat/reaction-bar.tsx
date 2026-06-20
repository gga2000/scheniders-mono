// apps/platform/components/chat/reaction-bar.tsx
"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { SmilePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";
import { chatKeys } from "@/hooks/chat/use-conversations";
import type { ChatReaction, ChatMessage } from "@/types/chat";

const QUICK = ["👍", "🔥", "✅", "❤️", "😂"];

export function ReactionBar({
    messageId,
    conversationId,
    reactions,
}: {
    messageId: string;
    conversationId: string;
    reactions: ChatReaction[];
}) {
    const { user } = useAuth();
    const { t } = useLanguage();
    const qc = useQueryClient();
    const grouped = useMemo(() => {
        const map = new Map<string, { count: number; mine: boolean }>();
        for (const r of reactions) {
            const cur = map.get(r.emoji) ?? { count: 0, mine: false };
            cur.count += 1;
            if (r.user_id === user?.id) cur.mine = true;
            map.set(r.emoji, cur);
        }
        return Array.from(map.entries());
    }, [reactions, user?.id]);

    const toggle = async (emoji: string, mine: boolean) => {
        if (!user?.id) return;
        const uid = user.id;
        // optimistic: show instant feedback; the reaction:update broadcast reconciles to truth
        qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
            old.map((m) => {
                if (m.id !== messageId) return m;
                const others = (m.reactions ?? []).filter((r) => !(r.user_id === uid && r.emoji === emoji));
                const next = mine
                    ? others
                    : [...others, { id: `temp-${uid}-${emoji}`, message_id: messageId, user_id: uid, emoji } as ChatReaction];
                return { ...m, reactions: next };
            })
        );
        if (mine) {
            await supabase.from("chat_message_reactions").delete().match({ message_id: messageId, user_id: uid, emoji });
        } else {
            await supabase.from("chat_message_reactions").insert({ message_id: messageId, user_id: uid, emoji });
        }
    };

    const hasReactions = grouped.length > 0;
    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${hasReactions ? "mt-1.5" : "mt-1"}`}>
            {grouped.map(([emoji, { count, mine }]) => (
                <motion.button
                    key={emoji}
                    onClick={() => toggle(emoji, mine)}
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileTap={{ scale: 0.92 }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                        mine
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground/80 hover:border-black/20"
                    }`}
                >
                    <span className="text-sm leading-none">{emoji}</span>
                    <span className="tabular-nums">{count}</span>
                </motion.button>
            ))}
            <div className={`reaction-add group/add relative ${hasReactions ? "" : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"}`}>
                <button
                    type="button"
                    aria-label={t("chat.reaction.add", "Add reaction")}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-muted-foreground transition-colors hover:border-black/20 hover:text-foreground"
                >
                    <SmilePlus className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-full left-0 z-10 mb-1 hidden gap-0.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1 shadow-xl group-hover/add:flex">
                    {QUICK.map((e) => (
                        <button
                            key={e}
                            type="button"
                            onClick={() => toggle(e, false)}
                            className="rounded-lg px-1 py-0.5 text-base leading-none transition-transform hover:scale-125"
                        >
                            {e}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
