// apps/platform/components/chat/conversation-list.tsx
"use client";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

export function ConversationList() {
    const { data: conversations = [] } = useConversations();
    const { activeConversationId, setActiveConversation } = useChatStore();
    const groups = {
        channel: conversations.filter((c) => c.kind === "channel"),
        dm: conversations.filter((c) => c.kind === "dm" || c.kind === "group"),
        order: conversations.filter((c) => c.kind === "order"),
    };
    const Section = ({ title, items }: { title: string; items: typeof conversations }) =>
        items.length === 0 ? null : (
            <div className="px-2 py-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
                {items.map((c) => (
                    <button key={c.id} onClick={() => setActiveConversation(c.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-black/5 ${activeConversationId === c.id ? "bg-black/5 font-semibold" : ""}`}>
                        <span className="truncate">{c.kind === "channel" ? `# ${c.name}` : c.name ?? "Direct message"}</span>
                        {c.unread > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c.unread}</span>}
                    </button>
                ))}
            </div>
        );
    return (
        <div className="w-[40%] max-w-[260px] overflow-y-auto border-r">
            <Section title="Channels" items={groups.channel} />
            <Section title="Direct" items={groups.dm} />
            <Section title="Order threads" items={groups.order} />
        </div>
    );
}
