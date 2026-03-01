"use client";

import { useState, useRef, useEffect } from "react";
import { useOrderActivityNotifications } from "@/hooks/use-order-activity-notifications";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Trash2, Package, RefreshCw, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function NotificationsDropdown() {
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
    } = useOrderActivityNotifications();

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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
                {unreadCount > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
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
                                <h3 className="font-semibold text-foreground">Activity Feed</h3>
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                                        {unreadCount}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                        title="Mark all as read"
                                    >
                                        <CheckCheck className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                        title="Clear all"
                                    >
                                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-[500px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                                        <Bell className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        You'll see updates when team members make changes
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
                                                !notification.isRead && "bg-primary/5"
                                            )}
                                            onClick={() => markAsRead(notification.id)}
                                        >
                                            {/* Unread Indicator */}
                                            {!notification.isRead && (
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
                                                        <span className="text-xs text-muted-foreground">
                                                            {notification.userName}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">•</span>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Clock className="w-3 h-3" />
                                                            {formatDistanceToNow(notification.timestamp, {
                                                                addSuffix: true,
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Status Change Details */}
                                                    {notification.metadata?.oldStatus && notification.metadata?.newStatus && (
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className="px-2 py-1 rounded-md bg-muted text-xs font-medium">
                                                                {notification.metadata.oldStatus}
                                                            </span>
                                                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                                                            <span className="px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium">
                                                                {notification.metadata.newStatus}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Mark as Read Button */}
                                                {!notification.isRead && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            markAsRead(notification.id);
                                                        }}
                                                        className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                                                        title="Mark as read"
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
                                    Real-time activity powered by Supabase
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
