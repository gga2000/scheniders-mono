"use client";

import { motion } from "framer-motion";
import { Building2, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_CARD } from "@/lib/animation-constants";

interface MerchantEmptyStateProps {
  hasFilters: boolean;
  hasSearch: boolean;
  searchQuery: string;
  onClearFilters: () => void;
  onClearSearch: () => void;
}

export function MerchantEmptyState({
  hasFilters,
  hasSearch,
  searchQuery,
  onClearFilters,
  onClearSearch,
}: MerchantEmptyStateProps) {
  // Search active state
  if (hasSearch) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_CARD}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
          <Search className="w-6 h-6 text-foreground/30" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">
          No results for &lsquo;{searchQuery}&rsquo;
        </h3>
        <p className="text-xs text-foreground/50 mb-5 max-w-[260px]">
          Try adjusting your search term or clearing it to see all merchants.
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className={cn(
            "px-4 py-2 rounded-full text-xs font-semibold",
            "bg-foreground text-background hover:opacity-90 transition-all"
          )}
        >
          Clear search
        </button>
      </motion.div>
    );
  }

  // Filters active state
  if (hasFilters) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_CARD}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
          <SlidersHorizontal className="w-6 h-6 text-foreground/30" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">
          No merchants match your filters
        </h3>
        <p className="text-xs text-foreground/50 mb-5 max-w-[260px]">
          Try broadening your filter criteria or clearing all filters to see
          every merchant.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className={cn(
            "px-4 py-2 rounded-full text-xs font-semibold",
            "bg-foreground text-background hover:opacity-90 transition-all"
          )}
        >
          Clear filters
        </button>
      </motion.div>
    );
  }

  // Truly empty state
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_CARD}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-2xl bg-foreground/[0.04] flex items-center justify-center">
          <Building2 className="w-8 h-8 text-foreground/20" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-foreground/[0.06] flex items-center justify-center">
          <Search className="w-3 h-3 text-foreground/25" />
        </div>
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1">
        No merchants yet
      </h3>
      <p className="text-xs text-foreground/50 max-w-[240px]">
        Merchants will appear here once they sign up on the platform.
      </p>
    </motion.div>
  );
}
