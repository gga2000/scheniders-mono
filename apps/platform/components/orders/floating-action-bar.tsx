import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Archive, Eye, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface FloatingActionBarProps {
    selectedCount: number;
    onConfirm: () => void;
    onReject: () => void;
    onArchive: () => void;
    onDelete?: () => void;
    disabled?: boolean;
}

export function FloatingActionBar({
    selectedCount,
    onConfirm,
    onReject,
    onArchive,
    onDelete,
    disabled = false,
}: FloatingActionBarProps) {
    const { t } = useLanguage();
    const [isVisible, setIsVisible] = useState(true);
    const [isHidden, setIsHidden] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("hideFloatingBar") === "true";
        }
        return false;
    });
    const rafRef = useRef<number | null>(null);

    // Track scroll position with RAF throttle — no setState spam
    useEffect(() => {
        const handleScroll = () => {
            if (rafRef.current) return; // already scheduled
            rafRef.current = requestAnimationFrame(() => {
                setIsVisible(window.scrollY > 200);
                rafRef.current = null;
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

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
                            {t("orders.ui.selectedCount", { count: selectedCount })}
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
                            {t("common.confirm")}
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
                            {t("orders.ui.reject")}
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
                            {t("common.archive")}
                        </button>

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        {onDelete && (
                            <button
                                onClick={onDelete}
                                disabled={disabled}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    "bg-red-100 text-red-700 hover:bg-red-200",
                                    disabled && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Trash2 className="w-4 h-4" />
                                {t("common.delete")}
                            </button>
                        )}

                        <div className="h-6 w-px bg-[var(--card-border)]" />

                        <button
                            onClick={toggleHidden}
                            className="p-2 text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-all"
                            title={t("orders.ui.hideQuickActions")}
                        >
                            <EyeOff className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
