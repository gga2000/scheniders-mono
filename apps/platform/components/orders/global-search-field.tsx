"use client";

import React, { useEffect } from "react";
import { Archive, ChevronsDownUp, ChevronsUpDown, ScanBarcode, Search } from "lucide-react";
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
    filters: { searchQuery?: string; searchIncludesArchive?: boolean; dateFrom?: string; dateTo?: string };
    setFilters: React.Dispatch<React.SetStateAction<{ searchQuery?: string; searchIncludesArchive?: boolean; dateFrom?: string; dateTo?: string }>>;
    inputClassName?: string;
    onScannerOpen?: () => void;
    /** Optional sub-filters toggle rendered next to the scanner button. When wired, it shows/hides the TYPE+PRODUCTS rows in the sticky filter bar. */
    subFiltersOpen?: boolean;
    onToggleSubFilters?: () => void;
}

export const GlobalSearchField = React.memo(function GlobalSearchField({ filters, setFilters, inputClassName = "w-full pl-10 pr-12 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all", onScannerOpen, subFiltersOpen, onToggleSubFilters }: GlobalSearchFieldProps) {
    const localSearchQuery = useOrderStore((s) => s.localSearchQuery);
    const setLocalSearchQuery = useOrderStore((s) => s.setLocalSearchQuery);
    const debouncedSearchQuery = useDebounce(localSearchQuery, 300);
    const { t } = useLanguage();

    // Track the previous search state to know when user starts/clears a search
    const prevSearchRef = React.useRef<string>("");

    useEffect(() => {
        const prevSearch = prevSearchRef.current;
        // Normalize scanned/pasted QR ("QR:{id}|PHONE:..") down to the order id; plain text passes through.
        const newSearch = extractScannedOrderId(debouncedSearchQuery);

        if (newSearch === (filters.searchQuery || "")) return; // No change needed

        if (newSearch && !prevSearch) {
            // User STARTED searching — clear date range so all orders are searchable
            setFilters((prev) => ({
                ...prev,
                searchQuery: newSearch,
                dateFrom: undefined,
                dateTo: undefined,
            }));
        } else if (!newSearch && prevSearch) {
            // User CLEARED search — restore today's date range
            const todayStr = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            })();
            setFilters((prev) => ({
                ...prev,
                searchQuery: undefined,
                dateFrom: todayStr,
                dateTo: todayStr,
            }));
        } else {
            // Search query changed but not starting/stopping — just update searchQuery
            setFilters((prev) => ({ ...prev, searchQuery: newSearch || undefined }));
        }

        prevSearchRef.current = newSearch;
    }, [debouncedSearchQuery, setFilters, filters.searchQuery]);

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
                        // Shift left of the scanner: scanner sits at right-9 (when query) or right-2; place this 9 left of that.
                        localSearchQuery ? "right-[4.5rem]" : "right-11"
                    )}
                >
                    {subFiltersOpen ? (
                        <ChevronsDownUp className="w-4 h-4" />
                    ) : (
                        <ChevronsUpDown className="w-4 h-4" />
                    )}
                </button>
            )}
            {/* Scanner button — shifts left when archive button is also visible */}
            {onScannerOpen && (
                <button
                    onClick={onScannerOpen}
                    title="Scan barcode"
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                        localSearchQuery ? "right-9" : "right-2"
                    )}
                >
                    <ScanBarcode className="w-4 h-4" />
                </button>
            )}
            {localSearchQuery && (
                <button
                    onClick={() => setFilters((prev) => ({ ...prev, searchIncludesArchive: !prev.searchIncludesArchive }))}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all flex items-center gap-1",
                        filters.searchIncludesArchive
                            ? "bg-orange-100 text-orange-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                            : "text-muted-foreground hover:bg-amber-100/40"
                    )}
                    title="Include Archive in Search"
                >
                    <Archive className="w-3.5 h-3.5" />
                    {filters.searchIncludesArchive && <span className="text-[10px] sm:hidden font-bold pr-1">{t("orders.filter.archivedIncluded")}</span>}
                </button>
            )}
        </div>
    );
});
