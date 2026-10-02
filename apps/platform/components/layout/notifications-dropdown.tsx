"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    useNotificationFeed,
    type FeedNotification,
    type NotificationFilter,
} from "@/hooks/use-notification-feed";
import { useChatStore } from "@/store/use-chat-store";
import { useOrderStore } from "@/store/use-order-store";
import { orderRepository } from "@/lib/repositories/order-repository";
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui/popover";
import {
    Bell, BellOff, BellRing, CheckCheck, Trash2, Loader2, Settings, ArrowUp,
} from "lucide-react";
import { buildFeedSections, firstUnreadBoundary } from "@/lib/notification-feed-sections";
import { NotificationFeedList } from "./notification-feed-list";
import { useNotificationPush } from "@/hooks/use-notification-push";
import { useNotificationMute } from "@/hooks/use-notification-settings";
import { useTitleBadge } from "@/hooks/use-title-badge";
import { NotificationSettingsDialog } from "./notification-settings-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

interface NotificationsDropdownProps {
    onOpenChange?: (open: boolean) => void;
    /**
     * The tab title is global, but this component mounts twice (desktop + mobile
     * bars, both present even when one is CSS-hidden). Only one instance may own
     * it, or the two fight over the prefix.
     */
    ownsTitleBadge?: boolean;
}

export function NotificationsDropdown({ onOpenChange, ownsTitleBadge = false }: NotificationsDropdownProps) {
    const [filter, setFilter] = useState<NotificationFilter>("all");
    // Open state is held here, not left to Radix, because the feed freezes while
    // the panel is on screen.
    const [open, setOpen] = useState(false);
    const {
        notifications,
        unreadCount,
        pendingCount,
        refresh,
        hasMore,
        isLoadingMore,
        loadMore,
        markAsRead,
        dismiss,
        markAllAsRead,
        clearAll,
    } = useNotificationFeed(filter, { live: !open });

    const { open: openChat } = useChatStore();
    const { openOrderDetails } = useOrderStore();
    const push = useNotificationPush();
    const { mute } = useNotificationMute();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { t } = useLanguage();
    const router = useRouter();
    const pathname = usePathname();
    const [openingId, setOpeningId] = useState<string | null>(null);

    useTitleBadge(ownsTitleBadge ? unreadCount : 0);

    const hasAnything = notifications.length > 0;

    const sections = useMemo(() => buildFeedSections(notifications), [notifications]);
    // F1. The divider only earns its place when there is a boundary to mark:
    // something unread, with something already-read above it.
    const unreadBoundary = firstUnreadBoundary(sections);

    /**
     * Every row leads somewhere. Order rows open the order — the details modal
     * only renders on /orders, so navigate there when we're elsewhere; the store
     * survives client-side navigation, so the modal opens as that page mounts.
     */
    const handleClick = async (n: FeedNotification) => {
        if (!n.is_read) markAsRead(n.id);
        if (openingId) return;

        if (n.category === "chat") {
            if (n.entity_id) openChat(n.entity_id);
            return;
        }

        if (n.entity_type !== "order" || !n.entity_id) return;
        setOpeningId(n.id);
        try {
            const order = await orderRepository.findById(n.entity_id);
            if (!order) {
                toast.error(t("notifications.orderGone", "That order no longer exists"));
                return;
            }
            openOrderDetails(order);
            if (pathname !== "/orders") router.push("/orders");
        } catch {
            toast.error(t("notifications.orderOpenFailed", "Couldn't open that order"));
        } finally {
            setOpeningId(null);
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                // Opening shows what's true now; after that the list holds still.
                if (next) refresh();
                onOpenChange?.(next);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    className="relative w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all data-[state=open]:ring-2 data-[state=open]:ring-[var(--pastel-yellow)] data-[state=open]:border-transparent"
                    title={t("notifications.title")}
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                className={cn(
                    "p-0 overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)] shadow-xl",
                    // A 384px popover is desktop furniture; on a phone the feed
                    // gets the whole screen.
                    "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-14 max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:rounded-t-2xl",
                    "sm:w-96 sm:rounded-2xl",
                )}
                style={{ zIndex: "var(--z-header-overlay)" }}
            >
                {/* Header */}
                <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-foreground">{t("notifications.title")}</h3>
                        {unreadCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                                {unreadCount}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                            title={t("notifications.settingsTitle", "Notification settings")}
                        >
                            <Settings className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {push.ready && push.availability !== "unsupported"
                            && push.availability !== "unconfigured" && (
                            <button
                                onClick={push.toggle}
                                disabled={push.busy || push.availability === "blocked"}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                                title={
                                    push.availability === "blocked"
                                        ? t("notifications.pushBlocked",
                                            "Notifications are blocked in your browser settings")
                                        : push.enabled
                                            ? t("notifications.orderPushOn")
                                            : t("notifications.orderPushOff")
                                }
                            >
                                {push.busy
                                    ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                    : push.enabled
                                        ? <BellRing className="w-4 h-4 text-primary" />
                                        : <BellOff className="w-4 h-4 text-muted-foreground" />}
                            </button>
                        )}
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                title={t("notifications.markAllRead")}
                            >
                                <CheckCheck className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )}
                        {hasAnything && (
                            <button
                                onClick={clearAll}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                title={t("notifications.clearAll")}
                            >
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]">
                    {([
                        ["all", t("notifications.filterAll", "All")],
                        ["unread", t("notifications.filterUnread", "Unread")],
                        ["mentions", t("notifications.mentions")],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key as NotificationFilter)}
                            aria-pressed={filter === key}
                            className={cn(
                                "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
                                filter === key
                                    ? "bg-foreground text-[var(--card-bg)]"
                                    : "text-muted-foreground hover:bg-muted",
                            )}
                        >
                            {label}
                            {key === "unread" && unreadCount > 0 && (
                                <span className="ml-1 opacity-60">{unreadCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/*
                  * Arrivals wait here instead of being spliced into the list
                  * someone is reading — a bulk status change can write dozens of
                  * rows a second, and each one used to push everything down.
                  */}
                {pendingCount > 0 && (
                    <button
                        onClick={refresh}
                        className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors border-b border-[var(--card-border)]"
                    >
                        <ArrowUp className="w-3.5 h-3.5" />
                        {t("notifications.showNew", "Show {count} new", { count: pendingCount })}
                    </button>
                )}

                {/* Feed */}
                <div className="max-h-[500px] max-sm:max-h-[calc(100vh-14rem)] overflow-y-auto">
                    {!hasAnything ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                                <Bell className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t("notifications.emptyDesc")}
                            </p>
                        </div>
                    ) : (
                        <>
                            <NotificationFeedList
                                sections={sections}
                                unreadBoundary={unreadBoundary}
                                openingId={openingId}
                                onOpen={(n) => void handleClick(n)}
                                onMarkRead={markAsRead}
                                onDismiss={dismiss}
                                onMute={mute}
                            />

                            {hasMore && (
                                <button
                                    onClick={loadMore}
                                    disabled={isLoadingMore}
                                    className="w-full py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-[var(--background)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {t("notifications.loadMore", "Load older")}
                                </button>
                            )}
                        </>
                    )}
                </div>

                {hasAnything && (
                    <div className="px-4 py-2 bg-[var(--background)] border-t border-[var(--card-border)] text-center">
                        <p className="text-xs text-muted-foreground">{t("notifications.footer")}</p>
                    </div>
                )}
            </PopoverContent>

            <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Popover>
    );
}
