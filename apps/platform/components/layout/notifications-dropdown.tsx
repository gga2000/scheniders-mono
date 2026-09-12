"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
    Bell, BellOff, BellRing, Check, CheckCheck, Trash2, Package, RefreshCw,
    Plus, Clock, Bot, Sparkles, ArrowRight, AtSign, X, Loader2, Layers, Settings, BellMinus,
    PackageX, Truck, Wallet, Star, Users, TimerReset,
} from "lucide-react";
import { useNotificationPush } from "@/hooks/use-notification-push";
import { useNotificationMute } from "@/hooks/use-notification-settings";
import { useTitleBadge } from "@/hooks/use-title-badge";
import { NotificationSettingsDialog } from "./notification-settings-dialog";
import { cn } from "@/lib/utils";
import { useStatusLabel } from "@/hooks/use-status-label";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale, enUS as enLocale } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { Order } from "@/lib/supabase";
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

/** Read a string field out of a notification's structured payload. */
function payloadText(n: FeedNotification, key: string): string | null {
    const v = n.payload[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

interface FeedGroup {
    /** Newest entry, the one actually rendered. */
    head: FeedNotification;
    /** Everything collapsed underneath it, newest first. */
    rest: FeedNotification[];
    unread: boolean;
}

/**
 * B6. Collapse RUNS of adjacent entries about the same thing.
 *
 * Only consecutive rows are folded, so a busy order cannot swallow unrelated
 * activity that happened in between — the feed stays chronological, it just
 * stops repeating itself.
 */
function groupFeed(items: FeedNotification[]): FeedGroup[] {
    const groups: FeedGroup[] = [];
    for (const n of items) {
        const prev = groups[groups.length - 1];
        if (prev && n.group_key && prev.head.group_key === n.group_key) {
            prev.rest.push(n);
            prev.unread = prev.unread || !n.is_read;
            continue;
        }
        groups.push({ head: n, rest: [], unread: !n.is_read });
    }
    return groups;
}

export function NotificationsDropdown({ onOpenChange, ownsTitleBadge = false }: NotificationsDropdownProps) {
    const [filter, setFilter] = useState<NotificationFilter>("all");
    const {
        notifications,
        unreadCount,
        hasMore,
        isLoadingMore,
        loadMore,
        markAsRead,
        dismiss,
        markAllAsRead,
        clearAll,
    } = useNotificationFeed(filter);

    const { open: openChat } = useChatStore();
    const { openOrderDetails } = useOrderStore();
    const push = useNotificationPush();
    const { mute } = useNotificationMute();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { t, language } = useLanguage();
    const orderStatusLabel = useStatusLabel();
    const router = useRouter();
    const pathname = usePathname();
    const [openingId, setOpeningId] = useState<string | null>(null);

    const dateLocale = language === "ar" ? arLocale : enLocale;
    const ago = (iso: string) =>
        formatDistanceToNow(new Date(iso), { addSuffix: true, locale: dateLocale });

    useTitleBadge(ownsTitleBadge ? unreadCount : 0);

    const hasAnything = notifications.length > 0;

    const groups = groupFeed(notifications);
    // F1. The divider only earns its place when there is a boundary to mark:
    // something unread, with something already-read above it.
    const firstUnreadIndex = groups.findIndex((g) => g.unread);
    const showDivider = firstUnreadIndex > 0;

    /**
     * The sentence is built here, not stored. A trigger writes structured columns
     * (`type`, `entity_label`, `payload`) precisely so the feed can be rendered in
     * the viewer's language — the old `message` column was English prose, which is
     * why the feed used to read English inside an Arabic UI.
     */
    const describe = (n: FeedNotification): string => {
        const ref = n.entity_label ?? "";
        switch (n.type) {
            case "order.created":
                return t("notifications.msgCreated", "New order {ref} created", { ref });
            case "order.status_changed":
                return t("notifications.msgStatusChanged", "Order {ref} status changed", { ref });
            case "order.updated":
                return t("notifications.msgUpdated", "Order {ref} was updated", { ref });
            case "order.bulk_status_changed": {
                // A mass status change arrives as one summary row rather than one
                // per order, so a bulk action cannot bury the rest of the feed.
                const count = typeof n.payload.count === "number" ? n.payload.count : 0;
                const to = payloadText(n, "new_status");
                return t(
                    "notifications.msgBulkStatus",
                    "{count} orders moved to {status}",
                    { count, status: to ? orderStatusLabel(to) : "" },
                );
            }
            case "order.sla_breached": {
                const count = typeof n.payload.count === "number" ? n.payload.count : 0;
                const hours = typeof n.payload.hours === "number" ? n.payload.hours : 2;
                return t("notifications.msgSla",
                    "{count} orders waiting more than {hours}h", { count, hours });
            }
            case "inventory.out_of_stock":
                return t("notifications.msgOutOfStock", "{ref} is out of stock", { ref });
            case "inventory.low_stock": {
                const stock = typeof n.payload.stock === "number" ? n.payload.stock : 0;
                return t("notifications.msgLowStock",
                    "{ref} is low — {stock} left", { ref, stock });
            }
            case "inventory.bulk_low": {
                const count = typeof n.payload.count === "number" ? n.payload.count : 0;
                return t("notifications.msgBulkLowStock",
                    "{count} products need restocking", { count });
            }
            case "delivery.export_failed": {
                const orders = typeof n.payload.order_count === "number" ? n.payload.order_count : 0;
                return t("notifications.msgExportFailed",
                    "Shipping export to {ref} failed — {count} orders", { ref, count: orders });
            }
            case "finance.wallet_empty":
                return t("notifications.msgWalletEmpty", "Wallet is empty — orders will stop");
            case "finance.wallet_low":
                return t("notifications.msgWalletLow", "Wallet is running low");
            case "customer.review_created": {
                const rating = typeof n.payload.rating === "number" ? n.payload.rating : null;
                return t("notifications.msgReview",
                    "New {rating}★ review on {ref}", { rating: rating ?? "?", ref });
            }
            case "customer.cart_recovered":
                return t("notifications.msgCartRecovered", "An abandoned cart was recovered");
            case "team.member_joined":
                return t("notifications.msgMemberJoined", "{ref} joined the team", { ref });
            case "team.role_changed": {
                const to = payloadText(n, "new_role") ?? "";
                return t("notifications.msgRoleChanged",
                    "{ref} is now {role}", { ref, role: to });
            }
            case "chat.mention":
            case "chat.message":
                return payloadText(n, "preview") ?? t("notifications.mentions");
            default:
                return payloadText(n, "preview") ?? n.type;
        }
    };

    const getActorName = (name: string | null) =>
        name === "Automation" ? t("notifications.actorAutomation", "Automation") : name ?? "";

    const getIcon = (n: FeedNotification) => {
        if (n.category === "chat") return <AtSign className="w-4 h-4 text-blue-500" />;
        switch (n.category) {
            case "inventory":
                return <PackageX className="w-4 h-4 text-rose-500" />;
            case "delivery":
                return <Truck className="w-4 h-4 text-orange-500" />;
            case "finance":
                return <Wallet className="w-4 h-4 text-rose-500" />;
            case "customer":
                return <Star className="w-4 h-4 text-amber-500" />;
            case "team":
                return <Users className="w-4 h-4 text-sky-500" />;
        }
        switch (n.type) {
            case "order.sla_breached":
                return <TimerReset className="w-4 h-4 text-rose-500" />;
            case "order.status_changed":
                return <RefreshCw className="w-4 h-4 text-amber-500" />;
            case "order.created":
                return <Plus className="w-4 h-4 text-emerald-500" />;
            case "order.updated":
                return <Package className="w-4 h-4 text-blue-500" />;
            case "order.bulk_status_changed":
                return <Layers className="w-4 h-4 text-violet-500" />;
            default:
                return <Bell className="w-4 h-4 text-muted-foreground" />;
        }
    };

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

    const oldStatus = (n: FeedNotification) => payloadText(n, "old_status");
    const newStatus = (n: FeedNotification) => payloadText(n, "new_status");

    return (
        <Popover onOpenChange={onOpenChange}>
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
                            <div className="divide-y divide-border">
                                {groups.map((group, index) => {
                                    const n = group.head;
                                    return (
                                    <motion.div
                                        key={n.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.2 }}
                                        className={cn(
                                            "px-4 py-3 hover:bg-[var(--background)] transition-colors cursor-pointer relative",
                                            !n.is_read && "bg-primary/5",
                                            // Spend the accent only where it earns it.
                                            n.priority === "urgent" && "border-l-2 border-l-rose-500",
                                        )}
                                        onClick={() => void handleClick(n)}
                                    >
                                        {showDivider && index === firstUnreadIndex && (
                                            <div className="absolute -top-px inset-x-0 flex items-center gap-2 px-4">
                                                <span className="h-px flex-1 bg-primary/40" />
                                                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                                                    {t("notifications.newSince", "New")}
                                                </span>
                                                <span className="h-px flex-1 bg-primary/40" />
                                            </div>
                                        )}
                                        {!n.is_read && (
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                                        )}

                                        <div className="flex items-start gap-3 pl-3">
                                            <div className={cn(
                                                "p-2 rounded-lg shrink-0 mt-0.5",
                                                n.category === "chat" ? "bg-blue-50 dark:bg-blue-900/20" : "bg-muted/50",
                                            )}>
                                                {getIcon(n)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    "text-sm text-foreground font-medium",
                                                    n.category === "chat" && "line-clamp-2",
                                                )}>
                                                    {describe(n)}
                                                </p>
                                                {group.rest.length > 0 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("notifications.moreUpdates",
                                                            "+{count} more updates",
                                                            { count: group.rest.length })}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-2 mt-1">
                                                    {n.actor_avatar === "bot" ? (
                                                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm shrink-0">
                                                            <Bot className="w-3 h-3" />
                                                        </div>
                                                    ) : n.actor_avatar ? (
                                                        <img
                                                            src={n.actor_avatar}
                                                            alt={n.actor_name ?? ""}
                                                            className="w-5 h-5 rounded-full border border-[var(--card-border)] bg-[var(--background)] object-cover shadow-sm shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[10px] font-bold shadow-sm shrink-0">
                                                            {(n.actor_name || "U").charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-xs text-muted-foreground font-medium">
                                                        {getActorName(n.actor_name)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">•</span>
                                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Clock className="w-3 h-3" />
                                                        {ago(n.created_at)}
                                                    </div>
                                                </div>

                                                {oldStatus(n) && newStatus(n) && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className={cn(
                                                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm",
                                                            getStatusBadgeStyle(oldStatus(n) as Order["status"]),
                                                        )}>
                                                            {oldStatus(n) === "new" && <Sparkles className="w-2.5 h-2.5 opacity-70" />}
                                                            {orderStatusLabel(oldStatus(n) as string)}
                                                        </div>
                                                        <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
                                                        <div className={cn(
                                                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm",
                                                            getStatusBadgeStyle(newStatus(n) as Order["status"]),
                                                        )}>
                                                            {newStatus(n) === "new" && <Sparkles className="w-2.5 h-2.5 opacity-70" />}
                                                            {orderStatusLabel(newStatus(n) as string)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-start gap-0.5 shrink-0">
                                                {openingId === n.id && (
                                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground m-1" />
                                                )}
                                                {!n.is_read && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                                        className="p-1 rounded-full hover:bg-muted transition-colors"
                                                        title={t("notifications.markRead")}
                                                    >
                                                        <Check className="w-4 h-4 text-muted-foreground" />
                                                    </button>
                                                )}
                                                {n.entity_type && n.entity_id && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            mute(n.entity_type!, n.entity_id!);
                                                        }}
                                                        className="p-1 rounded-full hover:bg-muted transition-colors"
                                                        title={t("notifications.muteThis",
                                                            "Stop notifying me about this")}
                                                    >
                                                        <BellMinus className="w-4 h-4 text-muted-foreground" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                                                    className="p-1 rounded-full hover:bg-muted transition-colors"
                                                    title={t("notifications.dismiss", "Dismiss")}
                                                >
                                                    <X className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                    );
                                })}
                            </div>

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
