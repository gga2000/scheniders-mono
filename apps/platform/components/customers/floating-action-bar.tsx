"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, FileDown, MessageCircle, Eye, EyeOff, Star, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingCustomerActionBarProps {
    selectedCount: number;
    onAddTags: () => void;
    onExport: () => void;
    onBroadcastMessage: () => void;
    onAddToFavorites?: () => void;
    onMarkRisk?: () => void;
    disabled?: boolean;
}

export function FloatingCustomerActionBar({
    selectedCount,
    onAddTags,
    onExport,
    onBroadcastMessage,
    onAddToFavorites,
    onMarkRisk,
    disabled = false,
}: FloatingCustomerActionBarProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [isHidden, setIsHidden] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("hideCustomerFloatingBar") === "true";
        }
        return false;
    });
    const [scrollY, setScrollY] = useState(0);

    // Track scroll position
    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Show bar only when scrolled past header (200px)
    useEffect(() => {
        setIsVisible(scrollY > 200);
    }, [scrollY]);

    const toggleHidden = () => {
        const newHidden = !isHidden;
        setIsHidden(newHidden);
        localStorage.setItem("hideCustomerFloatingBar", String(newHidden));
    };

    // Don't show if no customers selected or hidden by user
    if (!isVisible || selectedCount === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
                {isHidden ? (
                    // Collapsed state - just show expand button
                    <button
                        onClick={toggleHidden}
                        className="px-4 py-2 bg-white dark:bg-[#2A2A2A] rounded-full shadow-2xl border border-[var(--card-border)] text-muted hover:text-foreground transition-all"
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                ) : (
                    // Expanded state
                    <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#2A2A2A] rounded-2xl shadow-2xl border border-[var(--card-border)]">
                        <span className="text-sm font-medium text-foreground px-2">
                            {selectedCount} selected
                        </span>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Add Tags */}
                        <button
                            onClick={onAddTags}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-purple-100 text-purple-700 hover:bg-purple-200",
                                "dark:bg-purple-400/15 dark:text-purple-300 dark:hover:bg-purple-400/25",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                            title="Add tags to selected customers"
                        >
                            <Tag className="w-4 h-4" />
                            Tag
                        </button>

                        {/* Export to Excel */}
                        <button
                            onClick={onExport}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-blue-100 text-blue-700 hover:bg-blue-200",
                                "dark:bg-blue-400/15 dark:text-blue-300 dark:hover:bg-blue-400/25",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                            title="Export selected customers to Excel"
                        >
                            <FileDown className="w-4 h-4" />
                            Export
                        </button>

                        {/* WhatsApp Broadcast */}
                        <button
                            onClick={onBroadcastMessage}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-green-100 text-green-700 hover:bg-green-200",
                                "dark:bg-green-400/15 dark:text-green-300 dark:hover:bg-green-400/25",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                            title="Send WhatsApp message to selected customers"
                        >
                            <MessageCircle className="w-4 h-4" />
                            Message
                        </button>

                        {/* Optional: Add to Favorites */}
                        {onAddToFavorites && (
                            <>
                                <div className="h-6 w-px bg-[var(--card-border)]" />
                                <button
                                    onClick={onAddToFavorites}
                                    disabled={disabled}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                        "bg-amber-100 text-amber-700 hover:bg-amber-200",
                                        "dark:bg-amber-400/15 dark:text-amber-300 dark:hover:bg-amber-400/25",
                                        disabled && "opacity-50 cursor-not-allowed"
                                    )}
                                    title="Add to favorites/watchlist"
                                >
                                    <Star className="w-4 h-4" />
                                    Favorite
                                </button>
                            </>
                        )}

                        {/* Optional: Mark as Risk */}
                        {onMarkRisk && (
                            <button
                                onClick={onMarkRisk}
                                disabled={disabled}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    "bg-orange-100 text-orange-700 hover:bg-orange-200",
                                    "dark:bg-orange-400/15 dark:text-orange-300 dark:hover:bg-orange-400/25",
                                    disabled && "opacity-50 cursor-not-allowed"
                                )}
                                title="Mark customers as at-risk"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                At Risk
                            </button>
                        )}

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {/* Hide Button */}
                        <button
                            onClick={toggleHidden}
                            className="p-2 text-muted hover:text-foreground hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all"
                            title="Hide quick actions"
                        >
                            <EyeOff className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
