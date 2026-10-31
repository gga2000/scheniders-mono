"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { AdvancedFilters, FilterValues } from "./advanced-filters";

interface FilterBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    value: FilterValues | null;
    onApply: (filters: FilterValues) => void;
    onReset: () => void;
}

export function FilterBottomSheet({
    isOpen,
    onClose,
    value,
    onApply,
    onReset,
}: FilterBottomSheetProps) {
    const { t } = useLanguage();
    const sheetRef = useRef<HTMLDivElement>(null);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Sheet */}
                    <motion.div
                        ref={sheetRef}
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] bg-[var(--card-bg)] rounded-t-3xl shadow-2xl flex flex-col"
                    >
                        {/* Handle bar */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-[var(--card-border)] rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--card-border)]">
                            <h2 className="text-lg font-bold text-foreground">
                                {t("products.filters.advanced")}
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-[var(--background)] rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                            >
                                <X className="w-5 h-5 text-muted" />
                            </button>
                        </div>

                        {/* Filters content — rendered inline (embedded mode skips the outer toggle) */}
                        <div className="flex-1 overflow-y-auto">
                            <AdvancedFilters
                                embedded
                                value={value}
                                onApply={(filters) => {
                                    onApply(filters);
                                    onClose();
                                }}
                                onReset={() => {
                                    onReset();
                                    onClose();
                                }}
                            />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
