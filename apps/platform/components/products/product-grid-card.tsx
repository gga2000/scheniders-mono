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
    TrendingUp,
    Tag,
    GripVertical,
} from "lucide-react";
import { StockIndicator } from "./stock-indicator";
import { StockQuickAdjust } from "./stock-quick-adjust";
import { QuickActionsMenu } from "./quick-actions-menu";
import { BundleStockIndicator } from "./bundle-stock-indicator";
import { HealthScoreBadge } from "./health-score-badge";
import { StockSparkline } from "./stock-sparkline";
import { StockStatusBadges } from "./stock-status-badges";
import { BatchBadge } from "./batch-tracking/batch-badge";
import { useAbcTier } from "./abc-tier-context";
import { calculateProductScore, computeDailySalesRate, type ProductScoreInput } from "@/lib/utils/product-scoring";

interface ProductGridCardProps {
    product: Product;
    categoryName?: string;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
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
    const abcTier = useAbcTier(product.id);
    const [menuOpen, setMenuOpen] = useState(false);
    const [stockAdjustOpen, setStockAdjustOpen] = useState(false);
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
                    onToggleSelection(product.id);
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
                    onViewOrders={() => {}}
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
            </div>

            {/* Product Info */}
            <div className="p-4 space-y-2">
                {/* Name + Visibility */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <h3 className="font-bold text-foreground truncate w-full">
                            {product.name}
                        </h3>
                        {categoryName && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--background)] border border-[var(--card-border)] rounded-md w-fit">
                                <Tag className="w-3 h-3 text-[var(--foreground-subtle)]" />
                                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium truncate max-w-[100px]">
                                    {categoryName}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {abcTier && (
                            <span
                                className={cn(
                                    "inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold border",
                                    abcTier === "A" && "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
                                    abcTier === "B" && "bg-blue-500/10 text-blue-700 border-blue-500/20",
                                    abcTier === "C" && "bg-gray-500/10 text-gray-700 border-gray-500/20",
                                )}
                                title={t("products.tier.tooltip")}
                            >
                                {t(`products.tier.${abcTier.toLowerCase()}`)}
                            </span>
                        )}
                        <HealthScoreBadge score={healthScore} size="sm" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onVisibilityToggle(product);
                            }}
                            className={cn(
                                "p-1.5 rounded-lg transition-colors border",
                                product.is_visible
                                    ? "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20"
                                    : "bg-[var(--background)] text-muted border-[var(--card-border)] hover:bg-[var(--card-bg)]"
                            )}
                            title={product.is_visible ? t("products.visibleInStore") : t("products.hiddenInStore")}
                        >
                            {product.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Price + margin */}
                <div className="flex items-baseline justify-between gap-2">
                    <p className="text-lg font-bold text-foreground">
                        {formatIQD(product.price)}
                    </p>
                    {product.cost && product.cost > 0 && product.price > 0 && (
                        <span
                            className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
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
                </div>

                {/* Stock Progress Bar */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
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
                                showHoverTooltip
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
                    {/* Mini stock progress bar */}
                    <div className="h-1.5 w-full bg-[var(--background)] rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all",
                                stockRatio > 1
                                    ? "bg-blue-400"
                                    : stockRatio > 0.5
                                        ? "bg-green-400"
                                        : stockRatio > 0.25
                                            ? "bg-amber-400"
                                            : stockRatio > 0
                                                ? "bg-red-400"
                                                : "bg-gray-300"
                            )}
                            style={{ width: `${Math.min(stockRatio * 50, 100)}%` }}
                        />
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
                    daysSinceLastSale={Number.isFinite(healthScore.daysSinceLastSale) ? healthScore.daysSinceLastSale : 999}
                    daysOfSupply={Number.isFinite(healthScore.daysOfSupply) ? healthScore.daysOfSupply : 999}
                    size="sm"
                />


                {/* Sales & Revenue — compact */}
                <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--card-border)]">
                    <span className="text-muted flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" />
                        {product.times_sold || 0} {t("products.sold")}
                    </span>
                    <StockSparkline
                        stockQuantity={availableStock}
                        lowStockThreshold={threshold}
                        dailySalesRate={dailyRate}
                        onClick={() => onViewDetails(product)}
                    />
                    <span className="text-[var(--pastel-green)] font-semibold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {formatIQD(product.total_revenue || 0)}
                    </span>
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
