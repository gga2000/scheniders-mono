"use client";

// The Activity Feed's list, split out from the dropdown so it can be rendered
// (and looked at) without a session, a Supabase client or a realtime channel.
// The dropdown owns the data and the actions; this owns how a day of activity
// reads.

import {
    Bell, Bot, Check, Clock, Plus, Package, RefreshCw, Sparkles, ArrowRight,
    AtSign, X, Loader2, Layers, BellMinus, PackageX, Truck, Wallet, Star, Users,
    TimerReset, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ar as arLocale, enUS as enLocale } from "date-fns/locale";
import type { FeedNotification } from "@/hooks/use-notification-feed";
import type { FeedGroup, FeedSection } from "@/lib/notification-feed-sections";
import { cn } from "@/lib/utils";
import { useStatusLabel } from "@/hooks/use-status-label";
import { getStatusBadgeStyle, isSystemActor } from "@/lib/order-format-utils";
import { useLanguage } from "@/components/providers/language-provider";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { FINANCIAL_MASK, formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

/** Read a string field out of a notification's structured payload. */
function payloadText(n: FeedNotification, key: string): string | null {
    const v = n.payload[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

/** Read a number field out of a notification's structured payload (0 when absent). */
function payloadNumber(n: FeedNotification, key: string): number {
    const v = n.payload[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const isPrime = (n: FeedNotification) => n.type.startsWith("prime.");

export interface NotificationFeedListProps {
    sections: FeedSection[];
    /** Group key the "New" divider sits above, or null when there's no boundary. */
    unreadBoundary: string | null;
    /** Id of the row whose entity is being fetched, if any. */
    openingId: string | null;
    onOpen: (n: FeedNotification) => void;
    /** One id, or every id of a grouped line. */
    onMarkRead: (ids: string | string[]) => void;
    onDismiss: (ids: string | string[]) => void;
    onMute: (entityType: string, entityId: string) => void;
}

export function NotificationFeedList({
    sections,
    unreadBoundary,
    openingId,
    onOpen,
    onMarkRead,
    onDismiss,
    onMute,
}: NotificationFeedListProps) {
    const { t, language } = useLanguage();
    const { revealed } = useFinancialVisibility();
    // Hour groups the reader has opened, by group key (stable across updates).
    const [openHours, setOpenHours] = useState<ReadonlySet<string>>(() => new Set());
    const toggleHour = (key: string) =>
        setOpenHours((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const money = (n: number) => (revealed ? formatIQD(n) : FINANCIAL_MASK);
    const orderStatusLabel = useStatusLabel();
    const dateLocale = language === "ar" ? arLocale : enLocale;
    // Strict, not the fuzzy form: "منذ 13 ساعة" instead of "منذ 13 ساعة تقريباً".
    // The row has 384px to hold a name and a time, and the approximation wrapped
    // the actor's name onto its own line to buy a word nobody reads.
    const ago = (iso: string) =>
        formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: dateLocale });

    /** "Today" / "Yesterday" / the weekday and date it actually was. */
    const sectionLabel = (section: FeedSection) =>
        section.bucket === "today"
            ? t("notifications.today", "Today")
            : section.bucket === "yesterday"
                ? t("notifications.yesterday", "Yesterday")
                : format(section.date, "EEEE, d MMMM", { locale: dateLocale });

    /**
     * The sentence is built here, not stored. A trigger writes structured columns
     * (`type`, `entity_label`, `payload`) precisely so the feed can be rendered in
     * the viewer's language — the old `message` column was English prose, which is
     * why the feed used to read English inside an Arabic UI.
     */
    /** Who a Prime parcel line is about: the customer, else the order number. */
    const customerOf = (n: FeedNotification) => payloadText(n, "customer") ?? (n.entity_label || t("notifications.prime.customer"));

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
            case "wallet.topup_approved":
                return t("notifications.wallet.topupApproved", { amount: money(payloadNumber(n, "amount")) });
            case "wallet.topup_rejected":
                return t("notifications.wallet.topupRejected", { amount: money(payloadNumber(n, "amount")) });
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
            case "prime.delivered": {
                const count = payloadNumber(n, "count");
                const city = payloadText(n, "city");
                if (count === 1) return t("notifications.prime.deliveredOne", { name: payloadText(n, "customer") ?? ref });
                return city ? t("notifications.prime.deliveredIn", { count, city }) : t("notifications.prime.delivered", { count });
            }
            case "prime.returning":
                return t("notifications.prime.returning", { name: customerOf(n) });
            case "prime.cancelled":
                return t("notifications.prime.cancelled", { name: customerOf(n) });
            case "prime.price_changed":
                return t("notifications.prime.priceChanged", { name: customerOf(n) });
            case "prime.partial":
                return t("notifications.prime.partial", { name: customerOf(n) });
            case "prime.payment": {
                const line = t("notifications.prime.payment", { amount: money(payloadNumber(n, "amount")) });
                const parcels = payloadNumber(n, "parcels");
                if (parcels === 0) return line;
                return `${line} · ${t("notifications.prime.paymentMatch", { matched: payloadNumber(n, "matched"), different: payloadNumber(n, "different") })}`;
            }
            case "prime.ticket_reply": {
                const preview = payloadText(n, "preview");
                return preview
                    ? t("notifications.prime.ticketReply", { name: customerOf(n), preview })
                    : t("notifications.prime.ticketReplyNoText", { name: customerOf(n) });
            }
            case "prime.link_done":
                return t("notifications.prime.linkDone");
            case "prime.daily":
                return t("notifications.prime.daily", {
                    delivered: payloadNumber(n, "delivered"),
                    returning: payloadNumber(n, "returning"),
                    cash: money(payloadNumber(n, "collected")),
                });
            default:
                return payloadText(n, "preview") ?? n.type;
        }
    };

    const getActorName = (n: FeedNotification) => {
        if (isPrime(n)) return t("prime.page.title");
        const name = n.actor_name;
        return name === "Automation" || isSystemActor(name) ? t("notifications.actorAutomation", "Automation") : name ?? "";
    };

    const getIcon = (n: FeedNotification) => {
        if (n.category === "chat") return <AtSign className="w-4 h-4 text-blue-500" />;
        if (isPrime(n)) {
            return (
                <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded bg-[#315EA8]">
                    <span className="h-1.5 w-3 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                </span>
            );
        }
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

    const oldStatus = (n: FeedNotification) => payloadText(n, "old_status");
    const newStatus = (n: FeedNotification) => payloadText(n, "new_status");

    const statusPill = (status: string) => (
        <div data-status={status} className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm",
            getStatusBadgeStyle(status as Order["status"]),
        )}>
            {status === "new" && <Sparkles className="w-2.5 h-2.5 opacity-70" />}
            {orderStatusLabel(status)}
        </div>
    );

    const statusPills = (n: FeedNotification) => {
        const from = oldStatus(n);
        const to = newStatus(n);
        if (!from || !to) return null;
        return (
            <div className="flex items-center gap-2 mt-2">
                {statusPill(from)}
                <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
                {statusPill(to)}
            </div>
        );
    };

    /** "9:00 – 10:00 AM", in the reader's language. */
    const hourRange = (start: Date) => {
        const end = new Date(start.getTime() + 3_600_000);
        return `${format(start, "h:mm", { locale: dateLocale })} – ${format(end, "h:mm a", { locale: dateLocale })}`;
    };

    /**
     * An hour of order status changes, folded into one line ("14 orders
     * changed status"). Opening it lists every change; each still opens its
     * order. Mark read and dismiss act on the whole hour.
     */
    const renderStatusHour = (group: FeedGroup & { statusHour: Date }) => {
        const members = [group.head, ...group.rest];
        const ids = members.map((m) => m.id);
        const unreadIds = members.filter((m) => !m.is_read).map((m) => m.id);
        const orders = new Set(members.map((m) => m.entity_id ?? m.id)).size;
        const expanded = openHours.has(group.key);
        return (
            <div
                key={group.key}
                data-group-key={group.key}
                data-status-hour=""
                className={cn("relative", group.unread && "bg-primary/5")}
            >
                {group.key === unreadBoundary && (
                    <div className="absolute -top-px inset-x-0 flex items-center gap-2 px-4">
                        <span className="h-px flex-1 bg-primary/40" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                            {t("notifications.newSince", "New")}
                        </span>
                        <span className="h-px flex-1 bg-primary/40" />
                    </div>
                )}
                <div className="group/row relative px-4 py-3 hover:bg-[var(--background)] transition-colors">
                    {group.unread && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                    )}
                    <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleHour(group.key)}
                        className="flex w-full items-start gap-3 pl-3 text-left"
                    >
                        <div className="p-2 rounded-lg shrink-0 mt-0.5 bg-muted/50">
                            <RefreshCw className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0 pr-20 sm:pr-0">
                            <p className="text-sm text-foreground font-medium">
                                {t("notifications.statusHour", "{count} orders changed status", { count: orders })}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="whitespace-nowrap">{hourRange(group.statusHour)}</span>
                                <span className="shrink-0">•</span>
                                <span className="inline-flex items-center gap-0.5 font-medium">
                                    {expanded
                                        ? t("notifications.statusHourHide", "Hide")
                                        : t("notifications.statusHourShow", "Show {count}", { count: members.length })}
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                                </span>
                            </div>
                        </div>
                    </button>
                    <div className="absolute top-2 right-2 flex items-start gap-0.5 rounded-full transition-opacity sm:border sm:border-[var(--card-border)] sm:bg-[var(--card-bg)] sm:px-0.5 sm:shadow-sm sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-within:opacity-100">
                        {unreadIds.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onMarkRead(unreadIds)}
                                className="p-1 rounded-full hover:bg-muted transition-colors"
                                title={t("notifications.markRead")}
                            >
                                <Check className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onDismiss(ids)}
                            className="p-1 rounded-full hover:bg-muted transition-colors"
                            title={t("notifications.dismiss", "Dismiss")}
                        >
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                </div>
                {expanded && (
                    <ul className="pb-2">
                        {members.map((m) => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    onClick={() => onOpen(m)}
                                    className="flex w-full items-start gap-2 py-2 pl-[4.25rem] pr-4 text-left hover:bg-[var(--background)] transition-colors"
                                >
                                    {!m.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-xs font-medium text-foreground">{describe(m)}</span>
                                            {openingId === m.id
                                                ? <Loader2 className="w-3 h-3 shrink-0 animate-spin text-muted-foreground" />
                                                : <span className="shrink-0 text-[11px] text-muted-foreground">{ago(m.created_at)}</span>}
                                        </div>
                                        {statusPills(m)}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    };

    return (
        <>
            {sections.map((section) => (
                <section key={section.key}>
                    {/* The day stays on screen while its entries scroll past it. */}
                    <header className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--card-border)]">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            {sectionLabel(section)}
                        </span>
                        {section.unread > 0 && (
                            <span className="text-[10px] font-bold text-primary">
                                {section.unread}
                            </span>
                        )}
                    </header>

                    <div className="divide-y divide-border">
                        {section.groups.map((group) => {
                            if (group.statusHour && group.rest.length > 0) {
                                return renderStatusHour({ ...group, statusHour: group.statusHour });
                            }
                            const n = group.head;
                            return (
                                <div
                                    key={group.key}
                                    data-group-key={group.key}
                                    className={cn(
                                        "group/row px-4 py-3 hover:bg-[var(--background)] transition-colors cursor-pointer relative",
                                        !n.is_read && "bg-primary/5",
                                        // Spend the accent only where it earns it.
                                        n.priority === "urgent" && "border-l-2 border-l-rose-500",
                                    )}
                                    onClick={() => onOpen(n)}
                                >
                                    {group.key === unreadBoundary && (
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

                                        <div className="flex-1 min-w-0 pr-20 sm:pr-0">
                                            {/* A Prime line mixes words, names and money: it reads in its own direction, still left-aligned. */}
                                            <p dir={isPrime(n) ? "auto" : undefined} className={cn(
                                                "text-sm text-foreground font-medium",
                                                n.category === "chat" && "line-clamp-2",
                                                isPrime(n) && "text-left",
                                            )}>
                                                {describe(n)}
                                            </p>
                                            {group.rest.length > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    {group.rest.length === 1
                                                        ? t("notifications.moreUpdatesOne", "+1 more update")
                                                        : t("notifications.moreUpdates",
                                                            "+{count} more updates",
                                                            { count: group.rest.length })}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
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
                                                <span className="text-xs text-muted-foreground font-medium truncate">
                                                    {getActorName(n)}
                                                </span>
                                                <span className="text-xs text-muted-foreground shrink-0">•</span>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                                    <Clock className="w-3 h-3 shrink-0" />
                                                    {ago(n.created_at)}
                                                </div>
                                            </div>

                                            {statusPills(n)}
                                        </div>

                                        {/*
                                          * Lifted out of the flow: three permanent buttons
                                          * were eating ~90px of a 384px row, which is what
                                          * pushed the actor's name and the timestamp onto
                                          * lines of their own. They float in on hover as a
                                          * pill; touch has no hover, so there they stay put.
                                          */}
                                        <div className="absolute top-2 right-2 flex items-start gap-0.5 rounded-full transition-opacity sm:border sm:border-[var(--card-border)] sm:bg-[var(--card-bg)] sm:px-0.5 sm:shadow-sm sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-within:opacity-100">
                                            {openingId === n.id && (
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground m-1" />
                                            )}
                                            {!n.is_read && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
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
                                                        onMute(n.entity_type!, n.entity_id!);
                                                    }}
                                                    className="p-1 rounded-full hover:bg-muted transition-colors"
                                                    title={t("notifications.muteThis",
                                                        "Stop notifying me about this")}
                                                >
                                                    <BellMinus className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                                                className="p-1 rounded-full hover:bg-muted transition-colors"
                                                title={t("notifications.dismiss", "Dismiss")}
                                            >
                                                <X className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </>
    );
}
