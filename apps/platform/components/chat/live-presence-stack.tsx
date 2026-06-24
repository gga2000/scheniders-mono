"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import { ChatAvatar } from "./chat-avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui/popover";
import { useTenantPresence } from "@/hooks/chat/use-tenant-presence";
import { useStartDm } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";

export function LivePresenceStack() {
    const { otherUsers, totalOnline } = useTenantPresence();
    const startDm = useStartDm();
    const open = useChatStore((s) => s.open);
    const { t } = useLanguage();
    const [busy, setBusy] = useState<string | null>(null);

    const message = async (userId: string) => {
        setBusy(userId);
        try { const convId = await startDm.mutateAsync(userId); open(convId); } finally { setBusy(null); }
    };

    const onlineLabel = t("chat.presence.online", { count: totalOnline });

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="flex h-10 min-w-10 items-center justify-center rounded-full px-1 transition-colors hover:bg-foreground/5"
                    title={onlineLabel}
                    aria-label={onlineLabel}
                >
                    {otherUsers.length === 0 ? (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground">
                            <Users className="h-5 w-5" />
                        </span>
                    ) : (
                        <span className="flex items-center -space-x-2">
                            {otherUsers.slice(0, 3).map((u) => (
                                <span key={u.id} className="relative inline-block transition-transform hover:z-10 hover:-translate-y-0.5">
                                    <ChatAvatar
                                        userId={u.id}
                                        name={u.display_name}
                                        avatarUrl={u.avatar_url}
                                        size="sm"
                                        status={u.status}
                                        showStatus
                                        ringClassName="ring-2 ring-[var(--background)]"
                                    />
                                </span>
                            ))}
                            {otherUsers.length > 3 && (
                                <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card-bg)] text-[11px] font-semibold text-muted-foreground ring-2 ring-[var(--background)]">
                                    +{otherUsers.length - 3}
                                </span>
                            )}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 overflow-hidden p-0 bg-[var(--card-bg)] border-[var(--card-border)] shadow-xl">
                <div className="flex items-center gap-1.5 border-b border-[var(--card-border)] px-3 py-2.5 text-xs font-semibold text-foreground">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    {t("chat.presence.title", "Team")} · {onlineLabel}
                </div>
                {otherUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--background)] text-muted-foreground">
                            <Users className="h-5 w-5" />
                        </span>
                        <p className="text-xs font-semibold text-foreground">
                            {t("chat.presence.empty", "No one else online")}
                        </p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                            {t("chat.presence.emptyDesc", "Teammates will appear here when they come online.")}
                        </p>
                    </div>
                ) : (
                    <div className="max-h-80 overflow-y-auto overscroll-contain p-1">
                        {otherUsers.map((u) => (
                            <div key={u.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5">
                                <ChatAvatar
                                    userId={u.id}
                                    name={u.display_name}
                                    avatarUrl={u.avatar_url}
                                    size="sm"
                                    status={u.status}
                                    showStatus
                                    dotBorderClassName="border-[var(--card-bg)]"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium text-foreground">{u.display_name}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                        {u.custom_text ? `${u.custom_emoji ?? ""} ${u.custom_text}` : u.activity ?? u.status}
                                    </div>
                                </div>
                                <button
                                    onClick={() => message(u.id)}
                                    disabled={busy === u.id}
                                    className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 transition-all hover:bg-indigo-100 active:scale-95 disabled:opacity-60"
                                >
                                    {t("chat.presence.message", "Message")}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
