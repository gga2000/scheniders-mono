"use client";

import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

interface CustomerOmniSearchProps {
    rawSearch: string;
    setSearch: (search: string) => void;
}

export function CustomerOmniSearch({ rawSearch, setSearch }: CustomerOmniSearchProps) {
    const { t } = useLanguage();

    return (
        <div className="relative flex-1 w-full group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] group-focus-within:text-primary transition-colors duration-300">
                <Search className="h-4 w-4" />
            </div>

            <input
                type="text"
                placeholder={t("customers.searchPlaceholder") !== "customers.searchPlaceholder" ? t("customers.searchPlaceholder") : "Search by name, phone, or city..."}
                value={rawSearch}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
            />

            <AnimatePresence>
                {rawSearch && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setSearch("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] hover:text-foreground bg-[var(--card-border)] hover:bg-[var(--card-bg)] rounded-full p-1 transition-colors"
                        aria-label="Clear search"
                    >
                        <X className="w-4 h-4" />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
