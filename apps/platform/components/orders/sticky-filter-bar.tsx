"use client";

import { Filter, Layers, ChevronDown, ShieldCheck, Copy, Package, Check, X, RotateCcw, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Order, OrderStatus, OrderPriority } from "@/lib/supabase";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@scheniders/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";

interface FilterState {
    status?: OrderStatus | "all" | "refunds" | "refunded" | "refund_pending" | "replacements";
    searchQuery?: string;
    dateFrom?: string;
    dateTo?: string;
    city?: string;
    product?: string;
    priority?: OrderPriority;
    riskLevel?: 'low' | 'medium' | 'high' | 'blocked' | 'flagged';
    isReturn?: boolean;
    orderType?: 'refund' | 'replacement';
}

interface StickyFilterBarProps {
    filters: FilterState;
    setFilters: (filters: FilterState) => void;
    statusCounts: Record<string, number>;
    /** Products present in the orders matching the current view (every filter
     *  except the product filter). Drives the contextual product chip row. */
    productsInView?: { name: string; count: number }[];
    totalRiskCount?: number;
    showFilters: boolean;
    setShowFilters: (show: boolean) => void;
    hasActiveFilters: boolean;
    groupBy: 'none' | 'status' | 'city' | 'verified';
    setGroupBy: (group: 'none' | 'status' | 'city' | 'verified') => void;
    filterDuplicatesOnly?: boolean;
    setFilterDuplicatesOnly?: (val: boolean) => void;
    className?: string;
    isMobile?: boolean;
}

import { memo, useState } from "react";

export const StickyFilterBar = memo(function StickyFilterBar({
    filters,
    setFilters,
    statusCounts,
    productsInView = [],
    totalRiskCount,
    showFilters,
    setShowFilters,
    hasActiveFilters,
    groupBy,
    setGroupBy,
    filterDuplicatesOnly,
    setFilterDuplicatesOnly,
    className,
    isMobile = false
}: StickyFilterBarProps) {
    const { t } = useLanguage();
    const [useStatusColors, setUseStatusColors] = useState(true);

    // Contextual product sub-filters: show the most common products in the
    // current view as chips, with the long tail tucked into a "more" menu.
    const PRODUCT_CHIP_LIMIT = 8;
    const visibleProducts = productsInView.slice(0, PRODUCT_CHIP_LIMIT);
    const overflowProducts = productsInView.slice(PRODUCT_CHIP_LIMIT);
    const overflowActive = !!filters.product && overflowProducts.some((p) => p.name === filters.product);
    const toggleProduct = (name: string) =>
        setFilters({ ...filters, product: filters.product === name ? undefined : name });

    // Refund / replacement sub-filter only makes sense in the Confirmed & All
    // tabs (other tabs already isolate their own order types).
    const showOrderTypeFilter = !filters.status || filters.status === "all" || filters.status === "confirmed";
    const toggleOrderType = (type: 'refund' | 'replacement') =>
        setFilters({ ...filters, orderType: filters.orderType === type ? undefined : type });

    const filterOptions = [
        { id: "all", label: t("orders.status.all"), fullLabel: t("orders.status.all"), count: statusCounts.all },
        { id: "new", label: t("orders.status.new"), count: statusCounts.new || 0 },
        { id: "contacted", label: t("orders.status.contacted"), count: statusCounts.contacted || 0 },
        { id: "confirmed", label: t("orders.status.confirmed"), count: statusCounts.confirmed || 0 },
        { id: "in_transit", label: t("orders.status.inTransit"), count: statusCounts.in_transit || 0 },
        { id: "pending_checkout", label: t("orders.status.pendingCheckout"), count: statusCounts.pending_checkout || 0 },
        { id: "delivered", label: t("orders.status.delivered"), count: statusCounts.delivered || 0 },
        { id: "completed", label: t("orders.status.completed"), count: statusCounts.completed || 0 },
        { id: "cancelled", label: t("orders.status.cancelled"), count: statusCounts.cancelled || 0 },
        { id: "rejected", label: t("orders.status.rejected"), count: statusCounts.rejected || 0 },
        { id: "refunds", label: "المرتجعات", count: statusCounts.refunds || 0 },
        { id: "refunded", label: "مسترجعة", count: statusCounts.refunded || 0 },
        { id: "refund_pending", label: "قيد الاسترجاع", count: statusCounts.refund_pending || 0 },
        { id: "replacements", label: "الاستبدالات", count: statusCounts.replacements || 0 },
        { id: "suspended", label: "طلب معلق", count: statusCounts.suspended || 0 },
        { id: "no_response", label: t("orders.status.noResponse"), count: statusCounts.no_response || 0 },
    ];

    return (
        <div
            className={cn(
                "group/filters orders-sticky-filter transition-all duration-300 z-30",
                // Mobile Sticky Styles
                isMobile ? "sticky top-[78px] -mx-4 px-4 py-2 backdrop-blur-xl bg-background/80 border-b border-white/10 shadow-sm" : "",
                className
            )}
        >
            <div className={cn(
                "flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x py-6 pl-8 pr-6",
                // Mobile adjustments for touch targets
                isMobile ? "min-h-[50px]" : ""
            )}>
                {/* Status Pills */}
                {filterOptions.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => setFilters({ ...filters, status: option.id === "all" ? undefined : option.id as Order["status"] })}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-2 snap-start shrink-0 border",
                            // Mobile: Larger touch targets (48px min height for better accessibility)
                            isMobile
                                ? "min-h-[48px] px-5 py-3 text-sm font-semibold"
                                : "px-4 py-2 text-sm font-medium",

                            filters.status === option.id || (option.id === "all" && !filters.status)
                                ? "bg-primary text-(--primary-fg) border-primary font-bold shadow-[0_0_15px_rgba(239,255,0,0.2)] scale-105"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:border-[rgba(0,255,255,0.4)] dark:hover:text-white dark:hover:bg-[#242424]",

                            // Status specific colors when enabled
                            useStatusColors && option.id !== "all" && [
                                getStatusBadgeStyle(option.id as OrderStatus),
                                filters.status === option.id
                                    ? "ring-2 ring-current ring-offset-2 border-current! scale-105 font-bold shadow-lg"
                                    : "opacity-85 hover:opacity-100"
                            ]
                        )}
                    >
                        <span>{isMobile ? option.label : (option.fullLabel || option.label)}</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[12px] font-black min-w-[24px] text-center",
                            filters.status === option.id || (option.id === "all" && !filters.status)
                                ? "bg-background/20 text-current"
                                : "bg-muted-foreground/20 text-muted-foreground group-hover/filters:bg-muted-foreground/30"
                        )}>
                            {option.count}
                        </span>
                    </button>
                ))}

                {/* Vertical Divider */}
                <div className="w-px h-8 bg-border shrink-0 mx-1" />

                {/* Filters Toggle */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 shrink-0 border",
                        isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                        showFilters || hasActiveFilters
                            ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-400/15 dark:text-blue-200 dark:border-blue-400/35"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    {!isMobile && t("orders.toolbar.filter")}
                    {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                </button>

                {/* Grouping Toggle */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                                isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                                groupBy !== 'none'
                                    ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-400/15 dark:text-purple-200 dark:border-purple-400/35"
                                    : "bg-background text-muted-foreground border-border/50 hover:bg-muted dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                            )}
                        >
                            <Layers className="w-4 h-4" />
                            {!isMobile && `${t("common.group")}: ${groupBy === 'none' ? t("common.none") : t(`common.${groupBy}`)}`}
                            {isMobile && groupBy !== 'none' && t(`common.${groupBy}`)}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setGroupBy('none')}>{t("common.none")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGroupBy('status')}>{t("common.status")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGroupBy('city')}>{t("common.city")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGroupBy('verified')}>{t("common.verified")}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Return Filter Toggle */}
                <button
                    onClick={() => {
                        setFilters({ ...filters, isReturn: !filters.isReturn });
                    }}
                    className={cn(
                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                        isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                        filters.isReturn
                            ? "bg-purple-100 text-purple-700 border-purple-300 shadow-sm dark:bg-purple-400/15 dark:text-purple-200 dark:border-purple-400/35"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                    )}
                >
                    <div className="flex items-center gap-1.5">
                        {/* Simple Return Icon */}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4"
                        >
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                        <span>{!isMobile && t("orders.filter.refunds")}</span>
                    </div>
                </button>

                {/* Duplicates Filter Toggle */}
                {setFilterDuplicatesOnly && (
                    <button
                        onClick={() => {
                            setFilterDuplicatesOnly(!filterDuplicatesOnly);
                        }}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                            isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                            filterDuplicatesOnly
                                ? "bg-orange-100 text-orange-700 border-orange-300 shadow-sm dark:bg-[rgba(255,106,0,0.15)] dark:text-[#FF8C42] dark:border-[rgba(255,106,0,0.3)]"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                        )}
                    >
                        <Copy className="w-4 h-4" />
                        <span>{!isMobile && t("orders.filter.duplicates")}</span>
                    </button>
                )}

                {/* Risk Filter Toggle */}
                <button
                    onClick={() => {
                        if (filters.riskLevel) {
                            // Toggle OFF — just remove the risk filter
                            setFilters({ ...filters, riskLevel: undefined });
                        } else {
                            // Toggle ON — clear date/status filters so all flagged/rejected orders show
                            setFilters({ ...filters, riskLevel: 'flagged', status: 'all', dateFrom: undefined, dateTo: undefined });
                        }
                    }}
                    className={cn(
                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                        isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                        filters.riskLevel
                            ? "bg-red-100 text-red-700 border-red-300 shadow-sm dark:bg-red-400/15 dark:text-red-200 dark:border-red-400/35"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                    )}
                >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{!isMobile && t("common.risk")}</span>
                    {totalRiskCount !== undefined && totalRiskCount > 0 && (
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-bold min-w-[24px] text-center",
                            filters.riskLevel
                                ? "bg-red-200 text-red-800"
                                : "bg-muted-foreground/10 text-muted-foreground group-hover/filters:bg-muted-foreground/20"
                        )}>
                            {totalRiskCount}
                        </span>
                    )}
                </button>

                {/* Color Scheme Toggle */}
                <button
                    onClick={() => setUseStatusColors(!useStatusColors)}
                    title={useStatusColors ? "Disable Status Colors" : "Enable Status Colors"}
                    className={cn(
                        "p-2 rounded-full transition-all border shrink-0",
                        useStatusColors
                            ? "bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 text-white border-transparent shadow-md scale-110 active:scale-95"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground active:scale-90"
                    )}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                </button>
            </div>

            {/* Refund / Replacement Sub-Filter — only in Confirmed & All tabs */}
            {showOrderTypeFilter && (
                <div className={cn(
                    "flex items-center gap-2 overflow-x-auto scrollbar-hide",
                    isMobile ? "px-4 pb-2 -mt-1" : "pl-8 pr-6 pb-3 -mt-3"
                )}>
                    <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground/70 pr-1">
                        <Filter className="w-3.5 h-3.5" />
                        {!isMobile && (
                            <span className="text-[10px] font-bold uppercase tracking-widest">{t("orders.toolbar.orderType")}</span>
                        )}
                    </div>

                    <button
                        onClick={() => toggleOrderType("refund")}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border",
                            isMobile ? "px-4 py-2 text-xs font-semibold" : "px-3 py-1.5 text-xs font-medium",
                            filters.orderType === "refund"
                                ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:text-white dark:hover:bg-[#242424]"
                        )}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>المرتجعات</span>
                    </button>

                    <button
                        onClick={() => toggleOrderType("replacement")}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border",
                            isMobile ? "px-4 py-2 text-xs font-semibold" : "px-3 py-1.5 text-xs font-medium",
                            filters.orderType === "replacement"
                                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:text-white dark:hover:bg-[#242424]"
                        )}
                    >
                        <Repeat className="w-3.5 h-3.5" />
                        <span>الاستبدالات</span>
                    </button>
                </div>
            )}

            {/* Contextual Product Sub-Filters — products present in the current view */}
            {productsInView.length > 0 && (
                <div className={cn(
                    "flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x",
                    showOrderTypeFilter
                        ? (isMobile ? "px-4 pb-3" : "pl-8 pr-6 pb-5")
                        : (isMobile ? "px-4 pb-3 -mt-1" : "pl-8 pr-6 pb-5 -mt-3")
                )}>
                    <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground/70 pr-1">
                        <Package className="w-3.5 h-3.5" />
                        {!isMobile && (
                            <span className="text-[10px] font-bold uppercase tracking-widest">{t("orders.toolbar.products")}</span>
                        )}
                    </div>

                    {visibleProducts.map((product) => {
                        const isActive = filters.product === product.name;
                        return (
                            <button
                                key={product.name}
                                onClick={() => toggleProduct(product.name)}
                                title={product.name}
                                className={cn(
                                    "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 snap-start shrink-0 border",
                                    isMobile ? "px-4 py-2 text-xs font-semibold" : "px-3 py-1.5 text-xs font-medium",
                                    isActive
                                        ? "bg-blue-600 text-white border-blue-600 shadow-sm dark:bg-primary dark:text-black dark:border-primary"
                                        : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:border-[rgba(0,255,255,0.4)] dark:hover:text-white dark:hover:bg-[#242424]"
                                )}
                            >
                                <span className="max-w-[160px] truncate">{product.name}</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-full text-[10px] font-black min-w-[18px] text-center",
                                    isActive ? "bg-white/25 text-current" : "bg-muted-foreground/15 text-muted-foreground"
                                )}>
                                    {product.count}
                                </span>
                            </button>
                        );
                    })}

                    {overflowProducts.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className={cn(
                                        "rounded-full whitespace-nowrap transition-all flex items-center gap-1 shrink-0 border px-3 py-1.5 text-xs font-medium",
                                        overflowActive
                                            ? "bg-blue-600 text-white border-blue-600 dark:bg-primary dark:text-black dark:border-primary"
                                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:text-white"
                                    )}
                                >
                                    +{overflowProducts.length} {t("common.more")}
                                    <ChevronDown className="w-3 h-3 opacity-60" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
                                {overflowProducts.map((product) => (
                                    <DropdownMenuItem
                                        key={product.name}
                                        onClick={() => toggleProduct(product.name)}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <Check className={cn("w-3.5 h-3.5 shrink-0", filters.product === product.name ? "opacity-100" : "opacity-0")} />
                                            <span className="truncate">{product.name}</span>
                                        </span>
                                        <span className="text-xs text-muted-foreground font-semibold shrink-0">{product.count}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {filters.product && (
                        <button
                            onClick={() => setFilters({ ...filters, product: undefined })}
                            title="Clear product filter"
                            className="rounded-full shrink-0 border border-border/50 p-1.5 text-muted-foreground hover:text-rose-600 hover:border-rose-300 transition-all"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});
