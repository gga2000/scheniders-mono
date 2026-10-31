"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useLanguage } from "@/hooks/use-language";

// Live Activity Ticker notification
export interface TickerNotification {
    id: string;
    message: string;
    timestamp: Date;
}

export function LiveActivityTicker({ notifications }: { notifications: TickerNotification[] }) {
    const { language } = useLanguage();
    if (notifications.length === 0) return null;

    return (
        <div
            className="relative overflow-hidden rounded-2xl"
            role="status"
            aria-live="polite"
            aria-atomic="false"
        >
            <AnimatePresence mode="popLayout">
                {notifications.map((notif) => (
                    <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, x: 100, height: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="mb-2"
                    >
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-xl border border-[#E8E4DC] dark:border-white/10 rounded-xl shadow-sm">
                            <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <p className="text-sm text-[#1E1E1E] dark:text-white flex-1">
                                {notif.message}
                            </p>
                            <span className="text-[10px] text-[#9A9A9A] dark:text-gray-500 shrink-0">
                                {formatDistanceToNow(notif.timestamp, { addSuffix: true, locale: language === "ar" ? ar : undefined })}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

const TICKER_LIMIT = 3;
const TICKER_TTL_MS = 5000;

/** Last few live events, each auto-dismissed after a few seconds; timers are cleared on unmount. */
export function useActivityTicker() {
    const [notifications, setNotifications] = useState<TickerNotification[]>([]);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const pending = timers.current;
        return () => {
            pending.forEach(clearTimeout);
            pending.clear();
        };
    }, []);

    const push = useCallback((notification: TickerNotification) => {
        setNotifications((prev) => [notification, ...prev].slice(0, TICKER_LIMIT));
        const timer = setTimeout(() => {
            timers.current.delete(timer);
            setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
        }, TICKER_TTL_MS);
        timers.current.add(timer);
    }, []);

    return { notifications, push };
}
