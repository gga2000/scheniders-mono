"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    X,
    XCircle,
    AlertCircle,
    Info,
    ChevronDown,
    ChevronUp,
    Clock,
    TrendingDown,
} from "lucide-react";
import { Product, getStockStatus } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useProductStore } from "@/store/use-product-store";

interface LowStockAlertProps {
    products: Product[];
    onViewProduct?: (product: Product) => void;
}

type Severity = "critical" | "warning" | "info";

interface SeverityGroup {
    severity: Severity;
    products: (Product & { daysOfSupply: number | null })[];
    icon: React.ElementType;
    bgGradient: string;
    iconBg: string;
    iconColor: string;
    textColor: string;
    badgeColor: string;
    chipBg: string;
    chipText: string;
    chipHover: string;
}

function estimateDaysOfSupply(product: Product): number | null {
    // Use times_sold as a rough proxy for daily sales rate
    // Assume times_sold represents total lifetime sales
    // We estimate monthly rate from total_revenue and price
    const dailySalesRate =
        product.times_sold && product.times_sold > 0
            ? product.times_sold / 30 // rough estimate: assume times_sold is ~30 day window
            : null;

    if (!dailySalesRate || dailySalesRate <= 0) return null;

    const available = Math.max(
        0,
        product.stock_quantity - (product.reserved_quantity || 0)
    );
    return Math.round(available / dailySalesRate);
}

const PREVIEW_LIMIT = 5;

export function LowStockAlert({ products, onViewProduct }: LowStockAlertProps) {
    const { t, language } = useLanguage();
    const alertSnooze = useProductStore((s) => s.alertSnooze);
    const snoozeAlertSeverity = useProductStore((s) => s.snoozeAlertSeverity);
    const lowStockAlertExpanded = useProductStore((s) => s.lowStockAlertExpanded);
    const toggleLowStockAlertExpanded = useProductStore(
        (s) => s.toggleLowStockAlertExpanded
    );

    const [dismissedSeverities, setDismissedSeverities] = useState<Set<Severity>>(
        new Set()
    );

    const isSnoozed = (severity: Severity): boolean => {
        const snoozedUntil = alertSnooze[severity];
        return snoozedUntil !== null && Date.now() < snoozedUntil;
    };

    const severityGroups = useMemo(() => {
        const activeProducts = products.filter((p) => !p.is_archived);

        const outOfStock: (Product & { daysOfSupply: number | null })[] = [];
        const lowStock: (Product & { daysOfSupply: number | null })[] = [];
        const approaching: (Product & { daysOfSupply: number | null })[] = [];

        for (const product of activeProducts) {
            const status = getStockStatus(product);
            const daysOfSupply = estimateDaysOfSupply(product);
            const enriched = { ...product, daysOfSupply };

            if (status === "out_of_stock") {
                outOfStock.push(enriched);
            } else if (status === "low_stock") {
                lowStock.push(enriched);
            } else {
                // Check if approaching threshold (within 120% of low_stock_threshold)
                const available =
                    product.stock_quantity - (product.reserved_quantity || 0);
                const threshold = product.low_stock_threshold || 5;
                if (available <= threshold * 1.2) {
                    approaching.push(enriched);
                }
            }
        }

        // Sort each group by urgency (lowest days of supply first)
        const sortByUrgency = (
            a: { daysOfSupply: number | null },
            b: { daysOfSupply: number | null }
        ) => {
            if (a.daysOfSupply === null && b.daysOfSupply === null) return 0;
            if (a.daysOfSupply === null) return 1;
            if (b.daysOfSupply === null) return -1;
            return a.daysOfSupply - b.daysOfSupply;
        };

        outOfStock.sort(sortByUrgency);
        lowStock.sort(sortByUrgency);
        approaching.sort(sortByUrgency);

        const groups: SeverityGroup[] = [];

        if (outOfStock.length > 0) {
            groups.push({
                severity: "critical",
                products: outOfStock,
                icon: XCircle,
                bgGradient: "from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30",
                iconBg: "bg-rose-100 dark:bg-rose-900/50",
                iconColor: "text-rose-600 dark:text-rose-400",
                textColor: "text-rose-900 dark:text-rose-100",
                badgeColor: "bg-rose-500",
                chipBg: "bg-rose-100 dark:bg-rose-900/40",
                chipText: "text-rose-700 dark:text-rose-300",
                chipHover: "hover:bg-rose-200 dark:hover:bg-rose-800/50",
            });
        }

        if (lowStock.length > 0) {
            groups.push({
                severity: "warning",
                products: lowStock,
                icon: AlertTriangle,
                bgGradient: "from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30",
                iconBg: "bg-amber-100 dark:bg-amber-900/50",
                iconColor: "text-amber-600 dark:text-amber-400",
                textColor: "text-amber-900 dark:text-amber-100",
                badgeColor: "bg-amber-500",
                chipBg: "bg-amber-100 dark:bg-amber-900/40",
                chipText: "text-amber-700 dark:text-amber-300",
                chipHover: "hover:bg-amber-200 dark:hover:bg-amber-800/50",
            });
        }

        if (approaching.length > 0) {
            groups.push({
                severity: "info",
                products: approaching,
                icon: Info,
                bgGradient: "from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30",
                iconBg: "bg-blue-100 dark:bg-blue-900/50",
                iconColor: "text-blue-600 dark:text-blue-400",
                textColor: "text-blue-900 dark:text-blue-100",
                badgeColor: "bg-blue-500",
                chipBg: "bg-blue-100 dark:bg-blue-900/40",
                chipText: "text-blue-700 dark:text-blue-300",
                chipHover: "hover:bg-blue-200 dark:hover:bg-blue-800/50",
            });
        }

        return groups;
    }, [products]);

    // Filter out snoozed and dismissed severity groups
    const visibleGroups = severityGroups.filter(
        (g) => !isSnoozed(g.severity) && !dismissedSeverities.has(g.severity)
    );

    if (visibleGroups.length === 0) return null;

    const totalCount = visibleGroups.reduce(
        (sum, g) => sum + g.products.length,
        0
    );

    const handleSnooze = (severity: Severity) => {
        snoozeAlertSeverity(severity, 24);
    };

    const handleDismiss = (severity: Severity) => {
        setDismissedSeverities((prev) => {
            const next = new Set(prev);
            next.add(severity);
            return next;
        });
    };

    const formatSupplyDays = (days: number | null): string => {
        if (days === null) return t("products.alert.noSalesData");
        return t("products.alert.daysUntilStockout").replace("{days}", String(days));
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
        >
            <AnimatePresence mode="popLayout">
                {visibleGroups.map((group) => {
                    const isExpanded = lowStockAlertExpanded;
                    const displayProducts = isExpanded
                        ? group.products
                        : group.products.slice(0, PREVIEW_LIMIT);
                    const hasMore = group.products.length > PREVIEW_LIMIT;

                    const severityLabel =
                        group.severity === "critical"
                            ? t("products.alert.critical")
                            : group.severity === "warning"
                              ? t("products.alert.warning")
                              : t("products.alert.info");

                    const countLabel =
                        group.severity === "critical"
                            ? t("products.alert.outOfStockCount").replace(
                                  "{count}",
                                  String(group.products.length)
                              )
                            : group.severity === "warning"
                              ? t("products.alert.lowStockCount").replace(
                                    "{count}",
                                    String(group.products.length)
                                )
                              : t("products.alert.approachingCount").replace(
                                    "{count}",
                                    String(group.products.length)
                                );

                    const Icon = group.icon;

                    return (
                        <motion.div
                            key={group.severity}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="relative overflow-hidden rounded-2xl"
                        >
                            <div
                                className={cn(
                                    "absolute inset-0 bg-gradient-to-r",
                                    group.bgGradient
                                )}
                            />

                            <div className="relative p-4">
                                {/* Header */}
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                                            group.iconBg
                                        )}
                                    >
                                        <Icon
                                            className={cn("w-5 h-5", group.iconColor)}
                                        />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white",
                                                    group.badgeColor
                                                )}
                                            >
                                                {severityLabel}
                                            </span>
                                            <h3
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    group.textColor
                                                )}
                                            >
                                                {countLabel}
                                            </h3>
                                        </div>

                                        <p
                                            className={cn(
                                                "text-xs mt-0.5 opacity-70",
                                                group.textColor
                                            )}
                                        >
                                            {group.severity === "critical"
                                                ? t("products.alert.actionNeeded")
                                                : group.severity === "warning"
                                                  ? t("products.alert.reorderSoon")
                                                  : t("products.alert.monitorStock")}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => handleSnooze(group.severity)}
                                            className={cn(
                                                "inline-flex items-center justify-center gap-1 px-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] min-w-[44px]",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                            title={t("products.alert.snooze24h")}
                                        >
                                            <Clock className="w-3 h-3" />
                                            <span className="hidden sm:inline">
                                                {t("products.alert.snooze24h")}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleDismiss(group.severity)
                                            }
                                            className={cn(
                                                "inline-flex items-center justify-center rounded-lg transition-colors min-h-[44px] min-w-[44px]",
                                                group.chipHover
                                            )}
                                            title="Dismiss"
                                            aria-label="Dismiss alert"
                                        >
                                            <X
                                                className={cn(
                                                    "w-4 h-4",
                                                    group.iconColor
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* Product chips */}
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {displayProducts.map((product) => (
                                        <button
                                            key={product.id}
                                            onClick={() =>
                                                onViewProduct?.(product)
                                            }
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                        >
                                            <span className="truncate max-w-[120px]">
                                                {product.name}
                                            </span>
                                            <span className="opacity-60 text-[10px] flex items-center gap-0.5">
                                                ({product.stock_quantity})
                                            </span>
                                            {product.daysOfSupply !== null &&
                                                product.daysOfSupply > 0 && (
                                                    <span
                                                        className={cn(
                                                            "flex items-center gap-0.5 text-[10px]",
                                                            product.daysOfSupply <=
                                                                3
                                                                ? "text-rose-600 dark:text-rose-400"
                                                                : product.daysOfSupply <=
                                                                    7
                                                                  ? "text-amber-600 dark:text-amber-400"
                                                                  : "opacity-60"
                                                        )}
                                                    >
                                                        <TrendingDown className="w-2.5 h-2.5" />
                                                        {formatSupplyDays(
                                                            product.daysOfSupply
                                                        )}
                                                    </span>
                                                )}
                                        </button>
                                    ))}

                                    {hasMore && !isExpanded && (
                                        <button
                                            onClick={toggleLowStockAlertExpanded}
                                            className={cn(
                                                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                        >
                                            {t("products.alert.showMore").replace(
                                                "{count}",
                                                String(
                                                    group.products.length -
                                                        PREVIEW_LIMIT
                                                )
                                            )}
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Collapse button when expanded */}
                                {isExpanded && hasMore && (
                                    <button
                                        onClick={toggleLowStockAlertExpanded}
                                        className={cn(
                                            "flex items-center gap-1 mt-2 text-xs font-medium transition-colors",
                                            group.chipText,
                                            "opacity-70 hover:opacity-100"
                                        )}
                                    >
                                        <ChevronUp className="w-3 h-3" />
                                        {t("products.alert.collapse")}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </motion.div>
    );
}
