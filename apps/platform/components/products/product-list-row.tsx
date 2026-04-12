"use client";

import React from "react";
import { Product, getStockStatus } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    Package,
    CheckSquare,
    Square,
    Eye,
    EyeOff,
    Tag,
    GripVertical,
} from "lucide-react";
import { StockIndicator } from "./stock-indicator";
import { QuickActionsMenu } from "./quick-actions-menu";
import { HealthScoreBadge } from "./health-score-badge";
import { StockSparkline } from "./stock-sparkline";
import { calculateProductScore, computeDailySalesRate, type ProductScoreInput } from "@/lib/utils/product-scoring";

interface ProductListRowProps {
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

export const ProductListRow = React.memo(function ProductListRow({
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
}: ProductListRowProps) {
    const { t } = useLanguage();
    const stockStatus = getStockStatus(product);
    const availableStock = Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
    const threshold = product.low_stock_threshold || 5;
    const stockRatio = Math.min(availableStock / threshold, 2);
    const hasReserved = (product.reserved_quantity || 0) > 0;
    const margin = product.cost && product.cost > 0
        ? Math.round(((product.price - product.cost) / product.price) * 100)
        : null;
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

    return (
        <div
            className={cn(
                "bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all",
                isSelected && "ring-2 ring-[var(--foreground)]",
                isDragging && "opacity-50"
            )}
        >
            <div className="flex items-center p-4 gap-4">
                {/* Drag Handle */}
                <button
                    {...dragListeners}
                    className={cn(
                        "p-1 hover:bg-[var(--background)] rounded-lg transition-all flex-shrink-0",
                        dragListeners
                            ? "opacity-40 hover:opacity-100 cursor-grab"
                            : "hidden"
                    )}
                >
                    <GripVertical className="w-4 h-4 text-muted" />
                </button>

                {/* Selection Checkbox */}
                <button
                    onClick={() => onToggleSelection(product.id)}
                    className="p-1 hover:bg-[var(--background)] rounded-lg transition-colors flex-shrink-0"
                    aria-label={isSelected ? t("products.selection.deselectAll") : t("products.selection.selectAll")}
                >
                    {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-[var(--foreground)]" />
                    ) : (
                        <Square className="w-5 h-5 text-muted" />
                    )}
                </button>

                {/* Product Image */}
                <div
                    onClick={() => onViewDetails(product)}
                    className="w-14 h-14 rounded-xl bg-[var(--background)] flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                >
                    {product.image_url ? (
                        <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <Package className="w-6 h-6 text-muted" />
                    )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground truncate">{product.name}</h3>
                        {categoryName && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--background)] border border-[var(--card-border)] rounded-md flex-shrink-0">
                                <Tag className="w-3 h-3 text-[var(--foreground-subtle)]" />
                                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">
                                    {categoryName}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                        {product.sku && (
                            <span className="text-xs text-muted font-mono">{product.sku}</span>
                        )}
                    </div>
                </div>

                {/* Stock column with progress bar */}
                <div className="hidden sm:flex flex-col items-center gap-1 min-w-[100px]">
                    <StockIndicator
                        status={stockStatus}
                        quantity={availableStock}
                        size="sm"
                    />
                    <div className="h-1 w-16 bg-[var(--background)] rounded-full overflow-hidden">
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
                    {hasReserved && (
                        <span className="text-[10px] text-amber-600 font-medium">
                            {product.reserved_quantity} {t("products.rsvd")}
                        </span>
                    )}
                </div>

                {/* Price + Margin */}
                <div className="hidden md:flex flex-col items-end min-w-[100px]">
                    <p className="text-lg font-bold text-foreground">
                        {formatIQD(product.price)}
                    </p>
                    {margin !== null && (
                        <span className={cn(
                            "text-xs font-medium",
                            margin > 30 ? "text-green-600" :
                                margin > 15 ? "text-amber-600" :
                                    margin > 0 ? "text-orange-600" : "text-red-600"
                        )}>
                            {margin}% {t("products.margin")}
                        </span>
                    )}
                </div>

                {/* Sales */}
                <div className="hidden lg:flex flex-col items-center min-w-[70px]">
                    <p className="text-lg font-bold text-foreground">
                        {product.times_sold || 0}
                    </p>
                    <p className="text-xs text-muted">{t("products.soldLabel")}</p>
                </div>

                {/* Revenue */}
                <div className="hidden lg:flex flex-col items-end min-w-[100px]">
                    <p className="text-lg font-bold text-green-700">
                        {formatIQD(product.total_revenue || 0)}
                    </p>
                    <p className="text-xs text-muted">{t("products.revenue")}</p>
                </div>

                {/* Health Score */}
                <div className="hidden xl:flex items-center">
                    <HealthScoreBadge score={healthScore} size="sm" />
                </div>

                {/* Sparkline */}
                <div className="hidden xl:flex items-center">
                    <StockSparkline
                        stockQuantity={availableStock}
                        lowStockThreshold={threshold}
                        dailySalesRate={dailyRate}
                    />
                </div>

                {/* Visibility */}
                <div className="hidden xl:flex items-center">
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

                {/* Quick Actions — always visible */}
                <QuickActionsMenu
                    product={product}
                    onEdit={() => onEdit(product)}
                    onArchive={() => onArchive(product.id)}
                    onRestore={() => onRestore(product.id)}
                    onViewDetails={() => onViewDetails(product)}
                    onViewOrders={() => {}}
                    onDuplicate={onDuplicate ? () => onDuplicate(product) : undefined}
                    onDelete={onDelete ? () => onDelete(product) : undefined}
                />
            </div>
        </div>
    );
}, (prev, next) => {
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
        prev.product.sku === next.product.sku &&
        prev.product.low_stock_threshold === next.product.low_stock_threshold &&
        prev.isSelected === next.isSelected &&
        prev.categoryName === next.categoryName &&
        prev.isDragging === next.isDragging
    );
});
