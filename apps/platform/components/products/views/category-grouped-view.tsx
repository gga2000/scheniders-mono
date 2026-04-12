"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronDown,
    ChevronRight,
    Package,
    FolderOpen,
    Minimize2,
    Maximize2,
    CheckSquare,
    Square,
    Eye,
    EyeOff,
    MoreHorizontal,
    ArrowRight,
} from "lucide-react";
import { Product, getStockStatus } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { QuickActionsMenu } from "../quick-actions-menu";
import { useProductStore } from "@/store/use-product-store";

interface CategoryGroupedViewProps {
    products: Product[];
    categories: { id: string; name: string; image_url?: string | null }[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate: (product: Product) => void;
    onDelete: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
}

interface CategoryGroup {
    id: string | null;
    name: string;
    imageUrl?: string | null;
    products: Product[];
    totalStock: number;
    totalRevenue: number;
}

const INITIAL_VISIBLE = 8;

export function CategoryGroupedView({
    products,
    categories,
    selectedIds,
    onToggleSelection,
    onViewDetails,
    onEdit,
    onArchive,
    onRestore,
    onDuplicate,
    onDelete,
    onVisibilityToggle,
}: CategoryGroupedViewProps) {
    const { t } = useLanguage();
    const collapsedIds = useProductStore((s) => s.collapsedCategories);
    const toggleCategoryCollapse = useProductStore((s) => s.toggleCategoryCollapse);
    const setCategoryCollapsed = useProductStore((s) => s.setCategoryCollapsed);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const categoryMap = useMemo(() => {
        const map = new Map<string, { name: string; image_url?: string | null }>();
        for (const cat of categories) {
            map.set(cat.id, { name: cat.name, image_url: cat.image_url as string | null | undefined });
        }
        return map;
    }, [categories]);

    const groups = useMemo(() => {
        const grouped = new Map<string | null, Product[]>();

        for (const product of products) {
            const key = product.category_id || null;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(product);
        }

        const result: CategoryGroup[] = [];

        for (const [catId, catProducts] of grouped) {
            const cat = catId ? categoryMap.get(catId) : null;
            result.push({
                id: catId,
                name: cat?.name || t("products.views.category.uncategorized"),
                imageUrl: cat?.image_url,
                products: catProducts,
                totalStock: catProducts.reduce(
                    (sum, p) => sum + (p.stock_quantity || 0),
                    0
                ),
                totalRevenue: catProducts.reduce(
                    (sum, p) => sum + (p.total_revenue || 0),
                    0
                ),
            });
        }

        // Sort by product count descending, uncategorized always last
        result.sort((a, b) => {
            if (a.id === null) return 1;
            if (b.id === null) return -1;
            return b.products.length - a.products.length;
        });

        return result;
    }, [products, categoryMap, t]);

    const groupKey = (id: string | null) => id ?? "__uncategorized";

    const toggleCollapse = (id: string | null) => {
        toggleCategoryCollapse(groupKey(id));
    };

    const toggleShowAll = (id: string | null) => {
        const key = groupKey(id);
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const collapseAll = () => {
        groups.forEach((g) => setCategoryCollapsed(groupKey(g.id), true));
    };

    const expandAll = () => {
        groups.forEach((g) => setCategoryCollapsed(groupKey(g.id), false));
    };

    const allCollapsed =
        groups.length > 0 && collapsedIds.size === groups.length;

    if (products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
                <Package className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">{t("products.views.category.noProducts")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Top controls */}
            <div className="flex items-center justify-end gap-2">
                <button
                    onClick={allCollapsed ? expandAll : collapseAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--ink)] hover:bg-[var(--background)] transition-colors"
                >
                    {allCollapsed ? (
                        <>
                            <Maximize2 className="w-3.5 h-3.5" />
                            {t("products.views.category.expandAll")}
                        </>
                    ) : (
                        <>
                            <Minimize2 className="w-3.5 h-3.5" />
                            {t("products.views.category.collapseAll")}
                        </>
                    )}
                </button>
            </div>

            {/* Category sections */}
            <div className="space-y-3">
                {groups.map((group) => {
                    const key = groupKey(group.id);
                    const isCollapsed = collapsedIds.has(key);
                    const isShowingAll = expandedIds.has(key);
                    const visibleProducts = isShowingAll
                        ? group.products
                        : group.products.slice(0, INITIAL_VISIBLE);
                    const hasMore = group.products.length > INITIAL_VISIBLE;

                    return (
                        <div
                            key={key}
                            className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--card-shadow)] overflow-hidden"
                        >
                            {/* Category header */}
                            <button
                                onClick={() => toggleCollapse(group.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors"
                            >
                                {/* Collapse icon */}
                                <motion.div
                                    animate={{ rotate: isCollapsed ? -90 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <ChevronDown className="w-4 h-4 text-muted" />
                                </motion.div>

                                {/* Category image or icon */}
                                {group.imageUrl ? (
                                    <img
                                        src={group.imageUrl}
                                        alt={group.name}
                                        className="w-8 h-8 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center">
                                        <FolderOpen className="w-4 h-4 text-muted" />
                                    </div>
                                )}

                                {/* Category name */}
                                <span className="font-semibold text-sm text-[var(--ink)]">
                                    {group.name}
                                </span>

                                {/* Stats */}
                                <div className="flex items-center gap-2 ml-auto text-xs text-muted">
                                    <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-blue)] text-[var(--ink)] font-medium">
                                        {group.products.length}{" "}
                                        {t("products.views.category.products")}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-yellow)] text-[var(--ink)] font-medium">
                                        {group.totalStock.toLocaleString()}{" "}
                                        {t("products.views.category.units")}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-green)] text-[var(--ink)] font-medium">
                                        {formatIQD(group.totalRevenue)}
                                    </span>
                                </div>
                            </button>

                            {/* Products grid */}
                            <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{
                                            height: { duration: 0.3, ease: "easeInOut" },
                                            opacity: { duration: 0.2 },
                                        }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-4 pb-4 pt-1">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                                {visibleProducts.map((product) => (
                                                    <MiniProductCard
                                                        key={product.id}
                                                        product={product}
                                                        isSelected={selectedIds.has(product.id)}
                                                        onToggleSelection={onToggleSelection}
                                                        onViewDetails={onViewDetails}
                                                        onEdit={onEdit}
                                                        onArchive={onArchive}
                                                        onRestore={onRestore}
                                                        onDuplicate={onDuplicate}
                                                        onDelete={onDelete}
                                                        onVisibilityToggle={onVisibilityToggle}
                                                    />
                                                ))}
                                            </div>

                                            {/* Show all button */}
                                            {hasMore && !isShowingAll && (
                                                <button
                                                    onClick={() => toggleShowAll(group.id)}
                                                    className="mt-3 ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:text-[var(--ink)] transition-colors rounded-lg hover:bg-[var(--background)]"
                                                >
                                                    {t("products.views.category.showAll")}{" "}
                                                    {group.products.length}
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {hasMore && isShowingAll && (
                                                <button
                                                    onClick={() => toggleShowAll(group.id)}
                                                    className="mt-3 ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-[var(--ink)] transition-colors rounded-lg hover:bg-[var(--background)]"
                                                >
                                                    {t("products.views.category.collapseAll")}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Mini Product Card ─── */

interface MiniProductCardProps {
    product: Product;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate: (product: Product) => void;
    onDelete: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
}

function MiniProductCard({
    product,
    isSelected,
    onToggleSelection,
    onViewDetails,
    onEdit,
    onArchive,
    onRestore,
    onDuplicate,
    onDelete,
    onVisibilityToggle,
}: MiniProductCardProps) {
    const stockStatus = getStockStatus(product);
    const availableStock = Math.max(
        0,
        product.stock_quantity - (product.reserved_quantity || 0)
    );

    const stockColor =
        stockStatus === "out_of_stock"
            ? "text-red-500"
            : stockStatus === "low_stock"
              ? "text-amber-500"
              : "text-green-600";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
                "relative group flex items-center gap-3 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] hover:shadow-[var(--card-shadow)] transition-all cursor-pointer",
                isSelected && "ring-2 ring-[var(--foreground)]"
            )}
            onClick={() => onViewDetails(product)}
        >
            {/* Selection checkbox */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(product.id);
                }}
                className="absolute top-1.5 left-1.5 z-10 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Toggle selection"
            >
                {isSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[var(--foreground)]" />
                ) : (
                    <Square className="w-3.5 h-3.5 text-muted" />
                )}
            </button>

            {/* Quick actions */}
            <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <QuickActionsMenu
                    product={product}
                    onEdit={() => onEdit(product)}
                    onArchive={() => onArchive(product.id)}
                    onRestore={() => onRestore(product.id)}
                    onViewDetails={() => onViewDetails(product)}
                    onViewOrders={() => {}}
                    onDuplicate={() => onDuplicate(product)}
                    onDelete={() => onDelete(product)}
                />
            </div>

            {/* Product image */}
            <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--card-bg)] flex items-center justify-center">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <Package className="w-5 h-5 text-muted" />
                )}
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] truncate">
                    {product.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-semibold text-[var(--foreground)]">
                        {formatIQD(product.price)}
                    </span>
                    <span className={cn("text-[10px] font-medium", stockColor)}>
                        {availableStock} {product.is_visible ? "" : "("}
                        {!product.is_visible && (
                            <>
                                <EyeOff className="inline w-2.5 h-2.5" />
                                {")"}
                            </>
                        )}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
