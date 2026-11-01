"use client";

import React, { useEffect } from "react";
import { ChevronsDownUp, ChevronsUpDown, Megaphone, ScanBarcode, Search } from "lucide-react";
import { useOrderStore } from "@/store/use-order-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useLanguage } from "@/hooks/use-language";
import { extractScannedOrderId } from "@/lib/scan-utils";
import { cn } from "@/lib/utils";

/**
 * The orders search field, with the barcode scanner and sub-filter toggles.
 *
 * ARCH-1: lifted out of app/orders/page.tsx verbatim. It was declared at module
 * scope inside the page file, which is why the filter bar could not be extracted
 * without it.
 */
interface GlobalSearchFieldProps {
    setFilters: React.Dispatch<React.SetStateAction<{ searchQuery?: string }>>;
    inputClassName?: string;
    onScannerOpen?: () => void;
    /** Optional sub-filters toggle rendered next to the scanner button. When wired, it shows/hides the TYPE+PRODUCTS rows in the sticky filter bar. */
    subFiltersOpen?: boolean;
    onToggleSubFilters?: () => void;
    /** Optional ad-channel toggle, left of the sub-filters toggle. Shows/hides the channel chip row. */
    adChannelsOpen?: boolean;
    onToggleAdChannels?: () => void;
}

export const GlobalSearchField = React.memo(function GlobalSearchField({ setFilters, inputClassName = "w-full pl-10 pr-12 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all", onScannerOpen, subFiltersOpen, onToggleSubFilters, adChannelsOpen, onToggleAdChannels }: GlobalSearchFieldProps) {
    const localSearchQuery = useOrderStore((s) => s.localSearchQuery);
    const setLocalSearchQuery = useOrderStore((s) => s.setLocalSearchQuery);
    const debouncedSearchQuery = useDebounce(localSearchQuery, 300);
    const { t } = useLanguage();

    // Search is a server lookup across every date and status (see
    // useServerOrderSearch), so it no longer touches the date filter. It used to
    // wipe the date range when a search started — so the client could filter the
    // whole book — and reset it to TODAY when the search was cleared, throwing
    // away whatever range the merchant had been working in.
    useEffect(() => {
        // Normalize scanned/pasted QR ("QR:{id}|PHONE:..") down to the order id; plain text passes through.
        const next = extractScannedOrderId(debouncedSearchQuery) || undefined;
        setFilters((prev) => (prev.searchQuery === next ? prev : { ...prev, searchQuery: next }));
    }, [debouncedSearchQuery, setFilters]);

    return (
        <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-subtle)]" />
            <input
                type="text"
                placeholder={t ? t("orders.searchPlaceholder") : "Search orders..."}
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className={inputClassName}
            />
            {/* Ad-channel toggle — same look as the sub-filters toggle, one slot further left. */}
            {onToggleAdChannels && (
                <button
                    type="button"
                    onClick={onToggleAdChannels}
                    title={adChannelsOpen ? t("orders.toolbar.hideChannels") : t("orders.toolbar.showChannels")}
                    aria-label={adChannelsOpen ? t("orders.toolbar.hideChannels") : t("orders.toolbar.showChannels")}
                    aria-pressed={!!adChannelsOpen}
                    data-testid="toggle-ad-channels"
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                        adChannelsOpen
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                            : "text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                        // Left of the sub-filters toggle (right-11), or in its slot when there is none.
                        onToggleSubFilters ? "right-20" : "right-11"
                    )}
                >
                    <Megaphone className="w-4 h-4" />
                </button>
            )}
            {/* Sub-filters toggle — sits to the left of the scanner so the user
                can show/hide the TYPE + PRODUCTS rows without leaving the search bar. */}
            {onToggleSubFilters && (
                <button
                    onClick={onToggleSubFilters}
                    title={subFiltersOpen ? "Hide sub-filters" : "Show sub-filters"}
                    aria-label={subFiltersOpen ? "Hide sub-filters" : "Show sub-filters"}
                    aria-pressed={!!subFiltersOpen}
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                        subFiltersOpen
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                            : "text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                        // Sits left of the scanner, which is pinned at right-2.
                        "right-11"
                    )}
                >
                    {subFiltersOpen ? (
                        <ChevronsDownUp className="w-4 h-4" />
                    ) : (
                        <ChevronsUpDown className="w-4 h-4" />
                    )}
                </button>
            )}
            {/* Scanner button */}
            {onScannerOpen && (
                <button
                    onClick={onScannerOpen}
                    title={t("orders.ui.scanBarcode")}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                    )}
                >
                    <ScanBarcode className="w-4 h-4" />
                </button>
            )}
        </div>
    );
});
