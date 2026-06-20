// apps/platform/components/chat/reaction-bar.tsx
"use client";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
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

    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {grouped.map(([emoji, { count, mine }]) => (
                <button key={emoji} onClick={() => toggle(emoji, mine)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${mine ? "border-indigo-300 bg-indigo-50" : "border-black/10 bg-[var(--card-bg)]"}`}>
                    {emoji} {count}
                </button>
            ))}
            <div className="group relative">
                <button className="rounded-full border border-black/10 px-2 py-0.5 text-xs text-muted-foreground">＋</button>
                <div className="absolute z-10 hidden gap-1 rounded-lg border bg-[var(--card-bg)] p-1 shadow group-hover:flex">
                    {QUICK.map((e) => <button key={e} onClick={() => toggle(e, false)} className="px-1 text-sm hover:scale-110">{e}</button>)}
                </div>
            </div>
        </div>
    );
}
