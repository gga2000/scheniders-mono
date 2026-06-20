"use client";

import { useState, useRef, useEffect } from "react";
import { useOrderActivityNotifications } from "@/hooks/use-order-activity-notifications";
import { useMentionNotifications } from "@/hooks/chat/use-mention-notifications";
import { useChatStore } from "@/store/use-chat-store";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Trash2, Package, RefreshCw, Plus, Clock, Bot, Sparkles, ArrowRight, AtSign } from "lucide-react";
import { cn, getStatusLabel } from "@/lib/utils";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import { formatDistanceToNow } from "date-fns";
import { Order } from "@/lib/supabase";
import { useLanguage } from "@/components/providers/language-provider";

export function NotificationsDropdown() {
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
    } = useOrderActivityNotifications();

    const {
        mentions,
        unreadCount: mentionUnreadCount,
        markAsRead: markMentionAsRead,
    } = useMentionNotifications();
    const { open: openChat } = useChatStore();

    const totalUnread = unreadCount + mentionUnreadCount;

    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMentionClick = (mention: (typeof mentions)[number]) => {
        if (mention.conversation_id) openChat(mention.conversation_id);
        if (!mention.is_read) markMentionAsRead(mention.id);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'status_change':
                return <RefreshCw className="w-4 h-4 text-amber-500" />;
            case 'order_created':
                return <Plus className="w-4 h-4 text-emerald-500" />;
            case 'order_updated':
                return <Package className="w-4 h-4 text-blue-500" />;
            default:
                return <Bell className="w-4 h-4 text-muted-foreground" />;
        }
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Notification Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "relative w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all",
                    isOpen && "ring-2 ring-[var(--pastel-yellow)] border-transparent"
                )}
                title="Notifications"
            >
                <Bell className="w-5 h-5" />

                {/* Unread Count Badge */}
                {totalUnread > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg"
                    >
                        {totalUnread > 99 ? '99+' : totalUnread}
                    </motion.div>
                )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-2 w-96 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-xl overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell className="w-5 h-5 text-primary" />
                                <h3 className="font-semibold text-foreground">{t("notifications.title")}</h3>
                                {totalUnread > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                                        {totalUnread}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                        title={t("notifications.markAllRead")}
                                    >
                                        <CheckCheck className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                )}
                                {notifications.length > 0 && (
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

                        {/* Notifications List */}
                        <div className="max-h-[500px] overflow-y-auto">
                            {/* Mentions Section */}
                            {mentions.length > 0 && (
                                <div className="border-b border-[var(--card-border)]">
                                    <div className="px-4 py-2 bg-[var(--background)] flex items-center gap-1.5">
                                        <AtSign className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                            {t("notifications.mentions")}
                                        </span>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {mentions.map((mention, index) => (
                                            <motion.div
                                                key={mention.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.05, duration: 0.2 }}
                                                className={cn(
                                                    "px-4 py-3 hover:bg-[var(--background)] transition-colors cursor-pointer relative",
                                                    !mention.is_read && "bg-primary/5"
                                                )}
                                                onClick={() => handleMentionClick(mention)}
                                            >
                                                {!mention.is_read && (
                                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                                                )}
                                                <div className="flex items-start gap-3 pl-3">
                                                    <div className="p-2 rounded-lg bg-blue-50 shrink-0 mt-0.5">
                                                        <AtSign className="w-4 h-4 text-blue-500" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-foreground font-medium line-clamp-2">
                                                            {mention.preview}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {mention.actor_avatar ? (
                                                                <img
                                                                    src={mention.actor_avatar}
                                                                    alt={mention.actor_name}
                                                                    className="w-5 h-5 rounded-full border border-[var(--card-border)] bg-[var(--background)] object-cover shadow-sm shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[10px] font-bold shadow-sm shrink-0">
                                                                    {(mention.actor_name || 'U').charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span className="text-xs text-muted-foreground font-medium">
                                                                {mention.actor_name}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">•</span>
                                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                <Clock className="w-3 h-3" />
                                                                {formatDistanceToNow(new Date(mention.created_at), {
                                                                    addSuffix: true,
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {!mention.is_read && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                markMentionAsRead(mention.id);
                                                            }}
                                                            className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                                                            title={t("notifications.markRead")}
                                                        >
                                                            <Check className="w-4 h-4 text-muted-foreground" />
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {notifications.length === 0 && mentions.length === 0 ? (
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
                                <div className="divide-y divide-border">
                                    {notifications.map((notification, index) => (
                                        <motion.div
                                            key={notification.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                delay: index * 0.05,
                                                duration: 0.2,
                                            }}
                                            className={cn(
                                                "px-4 py-3 hover:bg-[var(--background)] transition-colors cursor-pointer relative",
                                                !notification.is_read && "bg-primary/5"
                                            )}
                                            onClick={() => markAsRead(notification.id)}
                                        >
                                            {/* Unread Indicator */}
                                            {!notification.is_read && (
                                                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                                            )}

                                            <div className="flex items-start gap-3 pl-3">
                                                {/* Icon */}
                                                <div className="p-2 rounded-lg bg-muted/50 shrink-0 mt-0.5">
                                                    {getActivityIcon(notification.type)}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-foreground font-medium">
                                                        {notification.message}
                                                    </p>

                                                    <div className="flex items-center gap-2 mt-1">
                                                        {/* User Avatar / Initials */}
                                                        {notification.user_avatar === 'bot' ? (
                                                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm shrink-0">
                                                                <Bot className="w-3 h-3" />
                                                            </div>
                                                        ) : notification.user_avatar ? (
                                                            <img
                                                                src={notification.user_avatar}
                                                                alt={notification.user_name}
                                                                className="w-5 h-5 rounded-full border border-[var(--card-border)] bg-[var(--background)] object-cover shadow-sm shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[10px] font-bold shadow-sm shrink-0">
                                                                {(notification.user_name || 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className="text-xs text-muted-foreground font-medium">
                                                            {notification.user_name}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">•</span>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Clock className="w-3 h-3" />
                                                            {formatDistanceToNow(new Date(notification.created_at), {
                                                                addSuffix: true,
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Status Change Details */}
                                                    {notification.old_status && notification.new_status && (
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <div className={cn(
                                                                "px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm",
                                                                getStatusBadgeStyle(notification.old_status as Order["status"])
                                                            )}>
                                                                {notification.old_status === 'new' && <Sparkles className="w-2.5 h-2.5 opacity-70" />}
                                                                {getStatusLabel(notification.old_status)}
                                                            </div>
                                                            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
                                                            <div className={cn(
                                                                "px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm",
                                                                getStatusBadgeStyle(notification.new_status as Order["status"])
                                                            )}>
                                                                {notification.new_status === 'new' && <Sparkles className="w-2.5 h-2.5 opacity-70" />}
                                                                {getStatusLabel(notification.new_status)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Mark as Read Button */}
                                                {!notification.is_read && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            markAsRead(notification.id);
                                                        }}
                                                        className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                                                        title={t("notifications.markRead")}
                                                    >
                                                        <Check className="w-4 h-4 text-muted-foreground" />
                                                    </button>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="px-4 py-2 bg-[var(--background)] border-t border-[var(--card-border)] text-center">
                                <p className="text-xs text-muted-foreground">
                                    {t("notifications.footer")}
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
