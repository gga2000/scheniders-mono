"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Product, getStockStatus } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useProductStore } from "@/store/use-product-store";

interface LowStockAlertProps {
    products: Product[];
    onViewProduct?: (product: Product) => void;
    /** Filters the list to out-of-stock or low-stock products. */
    onShowInList?: (stockStatus: "out_of_stock" | "low_stock") => void;
}

type Severity = "critical" | "warning" | "info";

type AlertProduct = Product & { available: number; daysOfSupply: number | null };

interface SeverityGroup {
    severity: Severity;
    products: AlertProduct[];
}

const SEVERITY_DOT: Record<Severity, string> = {
    critical: "bg-rose-500",
    warning: "bg-amber-500",
    info: "bg-sky-500",
};

const SEVERITY_COUNT_KEY: Record<Severity, string> = {
    critical: "products.alert.outOfStockCount",
    warning: "products.alert.lowStockCount",
    info: "products.alert.approachingCount",
};

const SEVERITY_STATUS: Record<Severity, "out_of_stock" | "low_stock" | null> = {
    critical: "out_of_stock",
    warning: "low_stock",
    info: null,
};

function estimateDaysOfSupply(available: number, product: Product): number | null {
    // Units sold in the last 30 days, per day. Lifetime sales would overstate
    // the rate for any product older than a month.
    const dailySalesRate = product.times_sold_30d && product.times_sold_30d > 0 ? product.times_sold_30d / 30 : null;
    if (!dailySalesRate) return null;
    return Math.round(available / dailySalesRate);
}

function byUrgency(a: AlertProduct, b: AlertProduct): number {
    if (a.daysOfSupply === null && b.daysOfSupply === null) return a.available - b.available;
    if (a.daysOfSupply === null) return 1;
    if (b.daysOfSupply === null) return -1;
    return a.daysOfSupply - b.daysOfSupply;
}

/**
 * One quiet row above the list: how many products are out, low or close to
 * low. The products themselves open on demand, so the catalogue stays first.
 */
export function LowStockAlert({ products, onViewProduct, onShowInList }: LowStockAlertProps) {
    const { t } = useLanguage();
    const alertSnooze = useProductStore((s) => s.alertSnooze);
    const snoozeAlertSeverity = useProductStore((s) => s.snoozeAlertSeverity);
    const expanded = useProductStore((s) => s.lowStockAlertExpanded);
    const toggleExpanded = useProductStore((s) => s.toggleLowStockAlertExpanded);

    const groups = useMemo<SeverityGroup[]>(() => {
        // Supplies and filler are not held in main stock (the list hides
        // them too), so a low count on them is not something to restock.
        const buckets: Record<Severity, AlertProduct[]> = { critical: [], warning: [], info: [] };
        for (const product of products) {
            if (product.is_archived || product.is_supply || product.is_filler) continue;
            const available = Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
            const enriched = { ...product, available, daysOfSupply: estimateDaysOfSupply(available, product) };
            const status = getStockStatus(product);
            if (status === "out_of_stock") buckets.critical.push(enriched);
            else if (status === "low_stock") buckets.warning.push(enriched);
            // Within 120% of the low-stock line: worth a look before it gets there.
            else if (available <= (product.low_stock_threshold || 5) * 1.2) buckets.info.push(enriched);
        }
        return (["critical", "warning", "info"] as const)
            .map((severity) => ({ severity, products: buckets[severity].sort(byUrgency) }))
            .filter((g) => g.products.length > 0);
    }, [products]);

    const now = Date.now();
    const visible = groups.filter((g) => {
        const until = alertSnooze[g.severity];
        return until === null || now >= until;
    });
    if (visible.length === 0) return null;

    const hasCritical = visible.some((g) => g.severity === "critical");

    return (
        <section
            aria-label={t("products.alert.stockAlert")}
            className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]"
        >
            <div className="flex items-center gap-3 px-4 py-2">
                <AlertTriangle
                    className={cn("h-4 w-4 shrink-0", hasCritical ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")}
                    aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
                    {visible.map((g) => {
                        const label = (
                            <>
                                <span className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[g.severity])} aria-hidden />
                                <span className={g.severity === "critical" ? "font-semibold" : undefined}>
                                    {t(SEVERITY_COUNT_KEY[g.severity], { count: g.products.length })}
                                </span>
                            </>
                        );
                        const status = SEVERITY_STATUS[g.severity];
                        return onShowInList && status ? (
                            <button
                                key={g.severity}
                                type="button"
                                onClick={() => onShowInList(status)}
                                title={t("products.alert.showInList")}
                                className="inline-flex items-center gap-1.5 rounded-md underline-offset-4 hover:underline"
                            >
                                {label}
                            </button>
                        ) : (
                            <span key={g.severity} className="inline-flex items-center gap-1.5">
                                {label}
                            </span>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={toggleExpanded}
                    aria-expanded={expanded}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--background)]"
                >
                    {t(expanded ? "products.alert.collapse" : "products.alert.review")}
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <button
                    type="button"
                    onClick={() => visible.forEach((g) => snoozeAlertSeverity(g.severity, 24))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--foreground-muted)] hover:bg-[var(--background)] hover:text-foreground"
                >
                    <Clock className="h-3.5 w-3.5" />
                    {t("products.alert.snooze24h")}
                </button>
            </div>

            {expanded && (
                <div className="space-y-2 border-t border-[var(--card-border)] px-4 py-3">
                    {visible.map((g) => (
                        <ul key={g.severity} className="flex flex-wrap gap-1.5" aria-label={t(SEVERITY_COUNT_KEY[g.severity], { count: g.products.length })}>
                            {g.products.map((product) => (
                                <li key={product.id}>
                                    <button
                                        type="button"
                                        onClick={() => onViewProduct?.(product)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-[var(--foreground-muted)]"
                                    >
                                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SEVERITY_DOT[g.severity])} aria-hidden />
                                        <bdi className="max-w-[180px] truncate font-medium">{product.name}</bdi>
                                        <span className="tabular-nums text-[var(--foreground-muted)]">
                                            {t("products.alert.leftCount", { count: product.available })}
                                        </span>
                                        {product.daysOfSupply !== null && product.daysOfSupply > 0 && (
                                            <span
                                                className={cn(
                                                    "tabular-nums",
                                                    product.daysOfSupply <= 7
                                                        ? "font-medium text-rose-600 dark:text-rose-400"
                                                        : "text-[var(--foreground-muted)]"
                                                )}
                                            >
                                                {t("products.alert.daysUntilStockout", { days: product.daysOfSupply })}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ))}
                </div>
            )}
        </section>
    );
}
