"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Dialog,
    BottomSheetContent,
} from "@scheniders/ui/dialog";
import { Search, X, History, Archive } from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useLanguage } from "@/hooks/use-language";

interface MobileSearchModalProps {
    open: boolean;
    onClose: () => void;
}

export function MobileSearchModal({ open, onClose }: MobileSearchModalProps) {
    const { filters, setFilters } = useOrdersContext();
    const { t } = useLanguage();
    const [localSearchQuery, setLocalSearchQuery] = useState(filters.searchQuery || "");
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync input with context
    useEffect(() => {
        setLocalSearchQuery(filters.searchQuery || "");
    }, [filters.searchQuery]);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [open]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setFilters({ ...filters, searchQuery: localSearchQuery });
        onClose();
    };

    const clearSearch = () => {
        setLocalSearchQuery("");
        setFilters({ ...filters, searchQuery: "" });
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <BottomSheetContent className="p-0 flex flex-col h-[90vh] bg-[var(--background)]">
                <div className="p-4 border-b border-[var(--card-border)] bg-[var(--background)] sticky top-0 z-10 space-y-3">
                    <div className="flex items-center gap-2">
                        <form onSubmit={handleSearch} className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder={t ? t("orders.searchPlaceholder") : "Search orders..."}
                                value={localSearchQuery}
                                onChange={(e) => setLocalSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-10 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all font-medium"
                            />
                            {localSearchQuery && (
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </form>
                        <button onClick={onClose} className="px-2 text-sm font-semibold text-muted-foreground shrink-0">
                            Cancel
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setFilters({ ...filters, searchIncludesArchive: !filters.searchIncludesArchive })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${filters.searchIncludesArchive
                                    ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:border-orange-500/30'
                                    : 'bg-[var(--card-bg)] border-[var(--card-border)] text-muted-foreground'
                                }`}
                        >
                            <Archive className="w-3 h-3" />
                            {filters.searchIncludesArchive ? "Including Archieved" : "Include Archived"}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {/* Placeholder for recent searches if needed */}
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-3">
                        <Search className="w-12 h-12 stroke-[1.5]" />
                        <p className="text-sm font-medium">Search by name, phone, city, or ID</p>
                    </div>
                </div>
            </BottomSheetContent>
        </Dialog>
    );
}
