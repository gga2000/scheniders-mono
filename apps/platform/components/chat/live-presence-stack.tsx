"use client";
import { useState } from "react";
import { Avatar } from "@scheniders/ui";
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui/popover";
import { useTenantPresence } from "@/hooks/chat/use-tenant-presence";
import { useStartDm } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

const dot = { online: "bg-green-500", idle: "bg-amber-500", away: "bg-gray-300" };

export function LivePresenceStack() {
    const { otherUsers, totalOnline } = useTenantPresence();
    const startDm = useStartDm();
    const { open } = useChatStore();
    const [busy, setBusy] = useState<string | null>(null);

    const message = async (userId: string) => {
        setBusy(userId);
        try { const convId = await startDm.mutateAsync(userId); open(convId); } finally { setBusy(null); }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="flex items-center -space-x-2" title={`${totalOnline} online`}>
                    {otherUsers.slice(0, 3).map((u) => (
                        <span key={u.id} className="relative inline-block rounded-full ring-2 ring-[var(--background)]">
                            <Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--background)] ${dot[u.status]}`} />
                        </span>
                    ))}
                    {otherUsers.length > 3 && <span className="ml-1 text-xs text-muted-foreground">+{otherUsers.length - 3}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b px-3 py-2 text-xs font-semibold">Team · {totalOnline} online</div>
                <div className="max-h-80 overflow-y-auto">
                    {otherUsers.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-black/5">
                            <span className="relative"><Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] ${dot[u.status]}`} /></span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium">{u.display_name}</div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                    {u.custom_text ? `${u.custom_emoji ?? ""} ${u.custom_text}` : u.activity ?? u.status}
                                </div>
                            </div>
                            <button onClick={() => message(u.id)} disabled={busy === u.id}
                                className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">Message</button>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
