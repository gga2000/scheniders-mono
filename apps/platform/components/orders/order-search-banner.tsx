"use client";

import { Loader2, Search, X } from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";

/**
 * Says what the list is showing while a search is active.
 *
 * Search ignores the date range and status chip (it is a lookup over every
 * order), so without this the list would appear to contradict the filters
 * above it. Clearing returns to that filtered view exactly as it was.
 */
export function OrderSearchBanner({ count }: { count: number }) {
    const { filters, setFilters, orderSearch } = useOrdersContext();
    if (!orderSearch.active) return null;

    const clear = () => {
        useOrderStore.getState().setLocalSearchQuery("");
        setFilters((prev) => ({ ...prev, searchQuery: undefined }));
    };

    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="order-search-banner"
            className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm"
        >
            {orderSearch.pending ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted" aria-hidden />
            ) : (
                <Search className="w-4 h-4 shrink-0 text-muted" aria-hidden />
            )}
            <span className="min-w-0 truncate">
                {orderSearch.error ? (
                    <span className="text-rose-600">Search failed: {orderSearch.error.message}</span>
                ) : orderSearch.pending ? (
                    <>Searching all orders for &ldquo;{filters.searchQuery}&rdquo;…</>
                ) : (
                    <>
                        <span className="font-semibold">{count}</span> {count === 1 ? "match" : "matches"} for &ldquo;{filters.searchQuery}&rdquo;
                        <span className="text-muted"> · all dates and statuses, archived and trash included</span>
                    </>
                )}
            </span>
            <button
                type="button"
                onClick={clear}
                className="ml-auto inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-xs font-semibold text-muted hover:text-foreground hover:bg-[var(--background)]"
            >
                <X className="w-3.5 h-3.5" aria-hidden /> Clear search
            </button>
        </div>
    );
}
