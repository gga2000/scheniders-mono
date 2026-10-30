"use client";

import React, { useState } from "react";
import { Product, getStockStatus } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useLongPress } from "@/hooks/use-long-press";
import {
    Package,
    CheckSquare,
    Square,
    Eye,
    EyeOff,
    ShoppingCart,
    Tag,
    GripVertical,
    ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { StockIndicator } from "./stock-indicator";
import { StockQuickAdjust } from "./stock-quick-adjust";
import { QuickActionsMenu } from "./quick-actions-menu";
import { BundleStockIndicator } from "./bundle-stock-indicator";
import { HealthScoreBadge } from "./health-score-badge";
import { FillerBadge } from "./filler-badge";
import { StockStatusBadges } from "./stock-status-badges";
import { BatchBadge } from "./batch-tracking/batch-badge";
import { CategoryCombobox } from "./category-combobox";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useUpdateProductMutation } from "@/hooks/use-products-query";
import { calculateProductScore, computeDailySalesRate, type ProductScoreInput } from "@/lib/utils/product-scoring";

interface ProductGridCardProps {
    product: Product;
    categoryName?: string;
    isSelected: boolean;
    onToggleSelection: (id: string, event?: React.MouseEvent) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate?: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
    dragListeners?: React.HTMLAttributes<HTMLButtonElement>;
    isDragging?: boolean;
}

export const ProductGridCard = React.memo(function ProductGridCard({
    product,
    categoryName,
    isSelected,
    onToggleSelection,
    onViewDetails,
    onEdit,
    onArchive,
    onRestore,
    onDuplicate,
    onDelete,
    onVisibilityToggle,
    dragListeners,
    isDragging,
}: ProductGridCardProps) {
    const { t } = useLanguage();
    const stockStatus = getStockStatus(product);
    const availableStock = Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
    const threshold = product.low_stock_threshold || 5;
    const stockRatio = Math.min(availableStock / threshold, 2);
    const hasReserved = (product.reserved_quantity || 0) > 0;
    const dailyRate = computeDailySalesRate(product.times_sold || 0);
    const scoreInput: ProductScoreInput = {
        id: product.id,
        price: product.price,
        cost: product.cost,
        stock_quantity: product.stock_quantity,
        reserved_quantity: product.reserved_quantity,
        low_stock_threshold: product.low_stock_threshold || 5,
        times_sold: product.times_sold || 0,
        total_revenue: product.total_revenue || 0,
        created_at: product.created_at || new Date().toISOString(),
        daily_sales_rate: dailyRate,
    };
    const healthScore = calculateProductScore(scoreInput);
    const [menuOpen, setMenuOpen] = useState(false);
    const [stockAdjustOpen, setStockAdjustOpen] = useState(false);
    const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
    const { data: allCategories = [] } = useCategoriesQuery();
    const updateProductMutation = useUpdateProductMutation();
    const longPress = useLongPress(() => setMenuOpen(true), { threshold: 500 });

    return (
        <div
            onPointerDown={longPress.onPointerDown}
            onPointerUp={longPress.onPointerUp}
            onPointerLeave={longPress.onPointerLeave}
            onPointerCancel={longPress.onPointerCancel}
            onContextMenu={(e) => {
                e.preventDefault();
                setMenuOpen(true);
            }}
            className={cn(
                "bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all group relative select-none",
                isSelected && "ring-2 ring-[var(--foreground)]",
                isDragging && "opacity-50"
            )}
        >
            {/* Selection Checkbox — always visible */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(product.id, e);
                }}
                className="absolute top-3 left-3 z-10 p-1.5 bg-white/80 backdrop-blur-sm rounded-lg hover:bg-white transition-colors"
                aria-label={isSelected ? t("products.selection.deselectAll") : t("products.selection.selectAll")}
            >
                {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-[var(--foreground)]" />
                ) : (
                    <Square className="w-4 h-4 text-muted" />
                )}
            </button>

            {/* Drag Handle */}
            <button
                {...dragListeners}
                className={cn(
                    "absolute top-3 left-12 z-10 p-1.5 rounded-lg transition-all",
                    dragListeners
                        ? "opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-white/80 backdrop-blur-sm cursor-grab"
                        : "hidden"
                )}
            >
                <GripVertical className="w-4 h-4 text-[var(--foreground)]" />
            </button>

            {/* Quick Actions — always visible at reduced opacity */}
            <div className="absolute top-3 right-3 z-10 opacity-60 group-hover:opacity-100 transition-opacity">
                <QuickActionsMenu
                    product={product}
                    onEdit={() => onEdit(product)}
                    onArchive={() => onArchive(product.id)}
                    onRestore={() => onRestore(product.id)}
                    onViewDetails={() => onViewDetails(product)}
                    onDuplicate={onDuplicate ? () => onDuplicate(product) : undefined}
                    onDelete={onDelete ? () => onDelete(product) : undefined}
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                />
            </div>

            {/* Product Image */}
            <div
                onClick={() => onViewDetails(product)}
                className="aspect-square bg-gradient-to-br from-[var(--background)] to-[var(--card-border)] flex items-center justify-center relative cursor-pointer"
            >
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <Package className="w-12 h-12 text-muted" />
                )}
                {/* Health score overlay — keep one grade indicator on the card */}
                <div
                    className="absolute bottom-2 left-2 bg-white/25 backdrop-blur-md border border-white/40 rounded-xl px-1.5 py-0.5 shadow-lg ring-1 ring-black/5"
                    onClick={(e) => e.stopPropagation()}
                >
                    <HealthScoreBadge score={healthScore} size="sm" showTooltip />
                </div>

                {/* Visibility toggle — image overlay bottom-right */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onVisibilityToggle(product);
                    }}
                    className={cn(
                        "absolute bottom-2 right-2 p-1.5 rounded-xl backdrop-blur-md border shadow-lg ring-1 ring-black/5 transition-colors",
                        product.is_visible
                            ? "bg-white/25 border-white/40 text-blue-600 hover:bg-white/40"
                            : "bg-black/30 border-white/20 text-white hover:bg-black/50"
                    )}
                    title={product.is_visible ? t("products.visibleInStore") : t("products.hiddenInStore")}
                >
                    {product.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
            </div>

            {/* Product Info */}
            <div className="p-3 space-y-2">
                {/* Name (left) · margin % + price (right) */}
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-foreground leading-tight line-clamp-2 flex-1 min-w-0">
                        {product.name}
                        <FillerBadge isFiller={product.is_filler} className="align-middle mr-1.5" />
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {product.cost && product.cost > 0 && product.price > 0 && (
                            <span
                                className={cn(
                                    "text-[10px] font-semibold px-2 py-0.5 rounded-md",
                                    ((product.price - product.cost) / product.price) * 100 >= 40
                                        ? "bg-[var(--pastel-green)] text-green-700"
                                        : ((product.price - product.cost) / product.price) * 100 >= 20
                                            ? "bg-[var(--pastel-yellow)] text-amber-700"
                                            : "bg-[var(--pastel-pink)] text-rose-700"
                                )}
                                title="Margin"
                            >
                                {(((product.price - product.cost) / product.price) * 100).toFixed(0)}%
                            </span>
                        )}
                        <p className="text-[15px] font-bold text-foreground whitespace-nowrap leading-tight">
                            {formatIQD(product.price)}
                        </p>
                    </div>
                </div>

                {/* Category chip · stock indicator · margin — side by side */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Category chip — inline picker */}
                    <div className="relative w-fit">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setCategoryPickerOpen((v) => !v);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--background)] border border-[var(--card-border)] rounded-md w-fit hover:bg-[var(--card-border)] cursor-pointer transition-colors group/catchip"
                        aria-haspopup="listbox"
                        aria-expanded={categoryPickerOpen}
                    >
                        <Tag className="w-3 h-3 text-[var(--foreground-subtle)]" />
                        <span
                            className={cn(
                                "text-[10px] font-medium truncate max-w-[140px]",
                                categoryName
                                    ? "text-[var(--foreground-subtle)]"
                                    : "text-muted"
                            )}
                        >
                            {categoryName ?? t("products.category.uncategorized")}
                        </span>
                        <ChevronDown className="w-3 h-3 text-[var(--foreground-subtle)] opacity-0 group-hover/catchip:opacity-100 transition-opacity" />
                    </button>
                    {categoryPickerOpen && (
                        <>
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCategoryPickerOpen(false);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="fixed inset-0 z-30"
                            />
                            <div
                                className="absolute left-0 top-full mt-1 z-40 min-w-[240px]"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <CategoryCombobox
                                    variant="anchored"
                                    open={categoryPickerOpen}
                                    onOpenChange={setCategoryPickerOpen}
                                    value={product.category_id ?? null}
                                    onChange={(newId) => {
                                        if (newId === (product.category_id ?? null)) {
                                            setCategoryPickerOpen(false);
                                            return;
                                        }
                                        const targetName =
                                            newId
                                                ? allCategories.find((c) => c.id === newId)?.name ?? ""
                                                : t("products.category.uncategorized");
                                        updateProductMutation.mutate(
                                            { id: product.id, data: { category_id: newId } },
                                            {
                                                onSuccess: () => {
                                                    toast.success(
                                                        t("products.bulkCategory.success", {
                                                            count: 1,
                                                            targetName,
                                                        })
                                                    );
                                                },
                                            }
                                        );
                                        setCategoryPickerOpen(false);
                                    }}
                                />
                            </div>
                        </>
                    )}
                    </div>

                    {/* Stock indicator */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setStockAdjustOpen((v) => !v);
                        }}
                        className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pastel-yellow)]"
                        aria-label="Adjust stock"
                    >
                        <StockIndicator
                            status={stockStatus}
                            quantity={availableStock}
                            threshold={threshold}
                            reserved={product.reserved_quantity || 0}
                            dailySalesRate={dailyRate}
                            size="sm"
                        />
                    </button>
                    {stockAdjustOpen && (
                        <>
                            <div
                                onClick={() => setStockAdjustOpen(false)}
                                className="fixed inset-0 z-30"
                            />
                            <div className="absolute left-4 right-4 z-40 mt-2">
                                <StockQuickAdjust
                                    productId={product.id}
                                    productName={product.name}
                                    currentStock={product.stock_quantity}
                                    onClose={() => setStockAdjustOpen(false)}
                                />
                            </div>
                        </>
                    )}

                    {hasReserved && (
                        <span
                            className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-md font-medium"
                            title={t("products.stock.reservedStock")}
                        >
                            {product.reserved_quantity} R
                        </span>
                    )}
                </div>

                {/* Stock Progress Bar */}
                <div>
                    {/* Mini stock progress bar */}
                    <div className="h-1.5 w-full bg-[var(--background)] rounded-full overflow-hidden relative">
                        {availableStock <= 0 ? (
                            <div
                                className="h-full w-full rounded-full animate-pulse"
                                style={{
                                    backgroundImage:
                                        "repeating-linear-gradient(45deg, rgba(244,63,94,0.85) 0 6px, rgba(225,29,72,0.85) 6px 12px)",
                                }}
                                title={t("products.status.outOfStock")}
                            />
                        ) : (
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all",
                                    stockRatio > 1
                                        ? "bg-blue-400"
                                        : stockRatio > 0.5
                                            ? "bg-green-400"
                                            : stockRatio > 0.25
                                                ? "bg-amber-400"
                                                : "bg-red-400"
                                )}
                                style={{ width: `${Math.min(stockRatio * 50, 100)}%` }}
                            />
                        )}
                    </div>
                </div>

                {/* Bundle stock indicator */}
                {product.product_type === "bundle" && (product as any).bundle_items?.length > 0 && (
                    <BundleStockIndicator
                        bundleItems={(product as any).bundle_items}
                        size="sm"
                    />
                )}

                {/* Nearest batch expiry */}
                <div className="flex items-center gap-1 flex-wrap">
                    <BatchBadge productId={product.id} size="sm" />
                </div>

                {/* Dead-stock / slow mover / overstock / understock badges */}
                <StockStatusBadges
                    flags={healthScore.flags}
                    dailySalesRate={dailyRate}
                    daysSinceLastSale={healthScore.daysSinceLastSale}
                    daysOfSupply={healthScore.daysOfSupply}
                    availableStock={availableStock}
                    size="sm"
                    showActions={false}
                />


                {/* Sales & Revenue */}
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-[var(--card-border)]">
                    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] px-2 py-1">
                        <ShoppingCart className="w-3 h-3 text-amber-700 shrink-0" />
                        <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate">
                                {product.times_sold || 0}
                            </span>
                            <span className="text-[9px] text-muted uppercase tracking-wide">
                                {t("products.sold")}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--pastel-green)]/40 border border-emerald-500/20 px-2 py-1">
                        <span className="text-[9px] font-bold text-emerald-700 shrink-0">IQD</span>
                        <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-xs font-semibold text-emerald-800 truncate">
                                {formatIQD(product.total_revenue || 0).replace(/^IQD\s*/, "")}
                            </span>
                            <span className="text-[9px] text-emerald-700/70 uppercase tracking-wide">
                                {t("products.revenue")}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    // Custom equality check — only re-render when these change
    return (
        prev.product.id === next.product.id &&
        prev.product.name === next.product.name &&
        prev.product.price === next.product.price &&
        prev.product.cost === next.product.cost &&
        prev.product.stock_quantity === next.product.stock_quantity &&
        prev.product.reserved_quantity === next.product.reserved_quantity &&
        prev.product.image_url === next.product.image_url &&
        prev.product.is_visible === next.product.is_visible &&
        prev.product.is_archived === next.product.is_archived &&
        prev.product.times_sold === next.product.times_sold &&
        prev.product.total_revenue === next.product.total_revenue &&
        prev.product.category_id === next.product.category_id &&
        prev.product.low_stock_threshold === next.product.low_stock_threshold &&
        prev.isSelected === next.isSelected &&
        prev.categoryName === next.categoryName &&
        prev.isDragging === next.isDragging
    );
});
