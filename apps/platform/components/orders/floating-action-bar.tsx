"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Archive, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingActionBarProps {
    selectedCount: number;
    onConfirm: () => void;
    onReject: () => void;
    onArchive: () => void;
    disabled?: boolean;
}

export function FloatingActionBar({
    selectedCount,
    onConfirm,
    onReject,
    onArchive,
    disabled = false,
}: FloatingActionBarProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [isHidden, setIsHidden] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("hideFloatingBar") === "true";
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
        localStorage.setItem("hideFloatingBar", String(newHidden));
    };

    // Don't show if no orders selected or hidden by user
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
                        className="px-4 py-2 bg-white rounded-full shadow-2xl border border-[var(--card-border)] text-muted hover:text-foreground transition-all"
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                ) : (
                    // Expanded state
                    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-2xl border border-[var(--card-border)]">
                        <span className="text-sm font-medium text-foreground px-2">
                            {selectedCount} selected
                        </span>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        <button
                            onClick={onConfirm}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-green-100 text-green-700 hover:bg-green-200",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <Check className="w-4 h-4" />
                            Confirm
                        </button>

                        <button
                            onClick={onReject}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-rose-100 text-rose-700 hover:bg-rose-200",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <X className="w-4 h-4" />
                            Reject
                        </button>

                        <button
                            onClick={onArchive}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                "bg-gray-100 text-gray-700 hover:bg-gray-200",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <Archive className="w-4 h-4" />
                            Archive
                        </button>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        <button
                            onClick={toggleHidden}
                            className="p-2 text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-all"
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
