"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Package, AlertTriangle, XCircle, TrendingDown } from "lucide-react";
import { Product, getStockStatus } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { ProductThumb } from "@/components/products/product-thumb";

interface KanbanStockBoardProps {
    products: Product[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onVisibilityToggle: (product: Product) => void;
}

type ColumnKey = "healthy" | "lowStock" | "outOfStock" | "overstock";

interface ColumnDef {
    key: ColumnKey;
    i18nKey: string;
    icon: React.ReactNode;
    accentClass: string;
    headerBg: string;
    badgeBg: string;
    badgeText: string;
    borderColor: string;
}

// Overstock is more than three months of the last 30 days' sales, and never
// less than ten times the low-stock threshold, so a slow seller isn't flagged
// the moment it is restocked.
function isOverstock(product: Product): boolean {
    const floor = (product.low_stock_threshold || 5) * 10;
    const limit = Math.max((product.times_sold_30d ?? 0) * 3, floor);
    return product.stock_quantity > limit;
}

function classifyProducts(products: Product[]) {
    const healthy: Product[] = [];
    const lowStock: Product[] = [];
    const outOfStock: Product[] = [];
    const overstock: Product[] = [];

    for (const p of products) {
        const threshold = p.low_stock_threshold || 5;

        if (p.stock_quantity <= 0) {
            outOfStock.push(p);
        } else if (p.stock_quantity <= threshold) {
            lowStock.push(p);
        } else if (isOverstock(p)) {
            overstock.push(p);
        } else {
            healthy.push(p);
        }
    }

    return { healthy, lowStock, outOfStock, overstock };
}

function getColumnValue(products: Product[]): number {
    return products.reduce((sum, p) => {
        const unitValue = p.cost || p.price || 0;
        return sum + p.stock_quantity * unitValue;
    }, 0);
}

function getDaysOfSupply(product: Product): string | null {
    if (product.stock_quantity <= 0) return null;
    if (!product.times_sold_30d || product.times_sold_30d <= 0) return null;
    const dailySales = product.times_sold_30d / 30;
    if (dailySales <= 0) return null;
    return Math.round(product.stock_quantity / dailySales).toString();
}

const COLUMNS: ColumnDef[] = [
    {
        key: "healthy",
        i18nKey: "products.views.kanban.healthy",
        icon: <Package className="w-4 h-4" />,
        accentClass: "bg-emerald-500",
        headerBg: "bg-emerald-500/10",
        badgeBg: "bg-emerald-500/15",
        badgeText: "text-emerald-700",
        borderColor: "border-emerald-500/20",
    },
    {
        key: "lowStock",
        i18nKey: "products.views.kanban.lowStock",
        icon: <AlertTriangle className="w-4 h-4" />,
        accentClass: "bg-amber-500",
        headerBg: "bg-amber-500/10",
        badgeBg: "bg-amber-500/15",
        badgeText: "text-amber-700",
        borderColor: "border-amber-500/20",
    },
    {
        key: "outOfStock",
        i18nKey: "products.views.kanban.outOfStock",
        icon: <XCircle className="w-4 h-4" />,
        accentClass: "bg-rose-500",
        headerBg: "bg-rose-500/10",
        badgeBg: "bg-rose-500/15",
        badgeText: "text-rose-700",
        borderColor: "border-rose-500/20",
    },
    {
        key: "overstock",
        i18nKey: "products.views.kanban.overstock",
        icon: <TrendingDown className="w-4 h-4" />,
        accentClass: "bg-blue-500",
        headerBg: "bg-blue-500/10",
        badgeBg: "bg-blue-500/15",
        badgeText: "text-blue-700",
        borderColor: "border-blue-500/20",
    },
];

function MiniCard({
    product,
    column,
    isSelected,
    onToggleSelection,
    onViewDetails,
    t,
}: {
    product: Product;
    column: ColumnDef;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
    onViewDetails: (product: Product) => void;
    t: (key: string) => string;
}) {
    const threshold = product.low_stock_threshold || 5;
    const days = getDaysOfSupply(product);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => onViewDetails(product)}
            className={cn(
                "bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] p-3 cursor-pointer",
                "hover:shadow-[var(--card-shadow)] transition-all",
                isSelected && "ring-2 ring-[var(--foreground)]"
            )}
        >
            <div className="flex items-start gap-3">
                {/* Product Image */}
                <div className="relative w-12 h-12 rounded-lg bg-[var(--background)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {product.image_url ? (
                        <ProductThumb src={product.image_url} alt={product.name} sizes="48px" />
                    ) : (
                        <Package className="w-5 h-5 text-muted" />
                    )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[var(--ink)] truncate">
                        {product.name}
                    </p>

                    {/* Stock count */}
                    <div className="flex items-center gap-1.5">
                        <span className={cn("text-xs font-medium", column.badgeText)}>
                            {column.key === "lowStock"
                                ? `${product.stock_quantity}/${threshold}`
                                : product.stock_quantity}{" "}
                            {t("products.views.kanban.units")}
                        </span>
                    </div>

                    {/* Days of supply */}
                    {product.stock_quantity > 0 && (
                        <p className="text-[11px] text-muted">
                            {days
                                ? `~${days}${t("products.views.kanban.daysSupply")}`
                                : t("products.views.kanban.noSales")}
                        </p>
                    )}

                    {/* Price */}
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                        {formatIQD(product.price)}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

export function KanbanStockBoard({
    products,
    selectedIds,
    onToggleSelection,
    onViewDetails,
    onEdit,
    onArchive,
    onRestore,
    onVisibilityToggle,
}: KanbanStockBoardProps) {
    const { t } = useLanguage();

    const classified = useMemo(() => classifyProducts(products), [products]);

    const columnData = useMemo(() => {
        const buckets: Record<ColumnKey, Product[]> = {
            healthy: classified.healthy,
            lowStock: classified.lowStock,
            outOfStock: classified.outOfStock,
            overstock: classified.overstock,
        };

        return COLUMNS.map((col) => ({
            ...col,
            products: buckets[col.key],
            count: buckets[col.key].length,
            value: getColumnValue(buckets[col.key]),
        }));
    }, [classified]);

    return (
        <div
            className={cn(
                "flex gap-4 overflow-x-auto pb-4 px-1",
                "snap-x snap-mandatory md:snap-none",
                "scrollbar-thin scrollbar-thumb-[var(--card-border)] scrollbar-track-transparent"
            )}
        >
            {columnData.map((col, colIndex) => (
                <motion.div
                    key={col.key}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: colIndex * 0.05 }}
                    className={cn(
                        "flex-shrink-0 w-[300px] md:flex-1 md:min-w-[260px] snap-center",
                        "flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--background)] overflow-hidden"
                    )}
                >
                    {/* Column Header */}
                    <div className={cn("p-4 space-y-2", col.headerBg)}>
                        {/* Accent bar */}
                        <div className={cn("h-1 w-10 rounded-full", col.accentClass)} />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={col.badgeText}>{col.icon}</span>
                                <h3 className="font-bold text-sm text-[var(--ink)]">
                                    {t(col.i18nKey)}
                                </h3>
                            </div>
                            <span
                                className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded-full",
                                    col.badgeBg,
                                    col.badgeText
                                )}
                            >
                                {col.count}
                            </span>
                        </div>

                        {/* Total value */}
                        <p className="text-xs text-muted">
                            {t("products.views.kanban.value")}:{" "}
                            <span className="font-semibold text-[var(--ink)]">
                                {formatIQD(col.value)}
                            </span>
                        </p>
                    </div>

                    {/* Scrollable Card List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-280px)] min-h-[200px]">
                        {col.products.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted">
                                <Package className="w-8 h-8 mb-2 opacity-30" />
                                <p className="text-xs">--</p>
                            </div>
                        ) : (
                            col.products.map((product) => (
                                <MiniCard
                                    key={product.id}
                                    product={product}
                                    column={col}
                                    isSelected={selectedIds.has(product.id)}
                                    onToggleSelection={onToggleSelection}
                                    onViewDetails={onViewDetails}
                                    t={t}
                                />
                            ))
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
