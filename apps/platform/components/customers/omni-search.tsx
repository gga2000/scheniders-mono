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
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] group-focus-within:text-[var(--pastel-yellow-solid)] transition-colors duration-300">
                <Search className="h-5 w-5" />
            </div>

            <input
                type="text"
                placeholder={t("customers.searchPlaceholder") || "Search customers by name, phone, or city..."}
                value={rawSearch}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow-solid)] focus:border-transparent transition-all shadow-sm"
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
