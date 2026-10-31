"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
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
    Plus,
    Sparkles,
    Check,
    X,
    Loader2,
} from "lucide-react";
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import { Product, getStockStatus } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { QuickActionsMenu } from "../quick-actions-menu";
import { useProductStore } from "@/store/use-product-store";
import { useUpdateProductMutation } from "@/hooks/use-products-query";
import { useAddCategoryMutation } from "@/hooks/use-categories-query";
import { CategoryQuickAssignPanel } from "../category-quick-assign-panel";
import { CategorySuggester } from "../category-suggester";
import { BulkCategoryConfirmDialog } from "../bulk-category-confirm-dialog";
import { FillerBadge } from "../filler-badge";
import { ProductThumb } from "@/components/products/product-thumb";

interface CategoryGroupedViewProps {
    products: Product[];
    categories: { id: string; name: string; image_url?: string | null }[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string, event?: React.MouseEvent) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate: (product: Product) => void;
    onDelete?: (product: Product) => void;
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
    const clearSelection = useProductStore((s) => s.clearSelection);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const updateProduct = useUpdateProductMutation();

    // DnD state
    const [activeProduct, setActiveProduct] = useState<Product | null>(null);
    const [activeDragCount, setActiveDragCount] = useState(1);

    // Bulk confirm dialog state
    const [bulkDialog, setBulkDialog] = useState<{
        open: boolean;
        productIds: string[];
        targetCategoryId: string | null;
        targetCategoryName: string;
        previewNames: string[];
    }>({
        open: false,
        productIds: [],
        targetCategoryId: null,
        targetCategoryName: "",
        previewNames: [],
    });

    // Quick-assign panel state
    const [quickAssign, setQuickAssign] = useState<{
        open: boolean;
        targetId: string | null;
        targetName: string;
    }>({ open: false, targetId: null, targetName: "" });

    // Suggester state
    const [suggesterOpen, setSuggesterOpen] = useState(false);

    // New-category inline creator
    const addCategory = useAddCategoryMutation();
    const [newCategoryOpen, setNewCategoryOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const submitNewCategory = useCallback(async () => {
        const name = newCategoryName.trim();
        if (!name || addCategory.isPending) return;
        try {
            await addCategory.mutateAsync({
                name,
                slug: name.toLowerCase().replace(/\s+/g, "-"),
                description: null,
                image_url: null,
                parent_id: null,
                display_order: 0,
                is_visible: true,
            } as any);
            toast.success(t("products.newCategory.created", { name }));
            setNewCategoryName("");
            setNewCategoryOpen(false);
        } catch (err) {
            toast.error(t("products.newCategory.error"));
        }
    }, [addCategory, newCategoryName, t]);

    // Mobile detection (disable DnD < 640px)
    const [dndEnabled, setDndEnabled] = useState(() =>
        typeof window === "undefined" ? true : window.innerWidth >= 640
    );
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setDndEnabled(window.innerWidth >= 640);
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    const categoryMap = useMemo(() => {
        const map = new Map<string, { name: string; image_url?: string | null }>();
        for (const cat of categories) {
            map.set(cat.id, { name: cat.name, image_url: cat.image_url as string | null | undefined });
        }
        return map;
    }, [categories]);

    const groups = useMemo(() => {
        const grouped = new Map<string | null, Product[]>();

        // Seed every known category so empty ones still render as drop targets.
        for (const cat of categories) {
            grouped.set(cat.id, []);
        }
        grouped.set(null, []);

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
            if (catId === null && catProducts.length === 0) continue; // hide empty uncategorized
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
    }, [products, categories, categoryMap, t]);

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

    const parseCategoryDropId = (id: string | number): string | null | undefined => {
        if (typeof id !== "string") return undefined;
        if (!id.startsWith("category:")) return undefined;
        const raw = id.slice("category:".length);
        return raw === "__uncategorized__" ? null : raw;
    };

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = String(event.active.id);
        const product = products.find((p) => p.id === id) || null;
        setActiveProduct(product);
        if (product && selectedIds.has(product.id) && selectedIds.size > 1) {
            setActiveDragCount(selectedIds.size);
        } else {
            setActiveDragCount(1);
        }
    }, [products, selectedIds]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveProduct(null);
        setActiveDragCount(1);
        if (!over) return;

        const parsed = parseCategoryDropId(over.id as string);
        if (parsed === undefined) return; // not a category drop target

        const targetId = parsed;
        const draggedId = String(active.id);
        const draggedProduct = products.find((p) => p.id === draggedId);
        if (!draggedProduct) return;

        const targetName = targetId
            ? (categoryMap.get(targetId)?.name ?? t("products.category.uncategorized"))
            : t("products.category.uncategorized");

        const isBulk = selectedIds.has(draggedId) && selectedIds.size > 1;

        if (isBulk) {
            const ids = Array.from(selectedIds);
            const selectedProducts = products.filter((p) => ids.includes(p.id));
            // Skip silently if all selected already have targetId
            const allAlreadyTarget = selectedProducts.every(
                (p) => (p.category_id ?? null) === targetId
            );
            if (allAlreadyTarget) return;

            const previewNames = selectedProducts.slice(0, 5).map((p) => p.name);
            setBulkDialog({
                open: true,
                productIds: ids,
                targetCategoryId: targetId,
                targetCategoryName: targetName,
                previewNames,
            });
        } else {
            // Single product
            if ((draggedProduct.category_id ?? null) === targetId) return;
            updateProduct.mutate(
                { id: draggedId, data: { category_id: targetId } },
                {
                    onSuccess: () => {
                        toast.success(
                            t("products.bulkCategory.success", {
                                count: 1,
                                targetName,
                            }) || `Moved 1 product to "${targetName}"`
                        );
                    },
                }
            );
        }
    }, [products, selectedIds, categoryMap, t, updateProduct]);

    if (products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
                <Package className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">{t("products.views.category.noProducts")}</p>
            </div>
        );
    }

    const content = (
        <div className="space-y-4">
            {/* Top controls */}
            <div className="flex items-center justify-end gap-2 flex-wrap">
                {newCategoryOpen ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1">
                        <input
                            autoFocus
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    submitNewCategory();
                                } else if (e.key === "Escape") {
                                    setNewCategoryOpen(false);
                                    setNewCategoryName("");
                                }
                            }}
                            placeholder={t("products.newCategory.placeholder")}
                            className="bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none w-48"
                        />
                        <button
                            onClick={submitNewCategory}
                            disabled={!newCategoryName.trim() || addCategory.isPending}
                            className="p-1 rounded-md hover:bg-[var(--background)] disabled:opacity-40 disabled:cursor-not-allowed text-emerald-600"
                            aria-label={t("common.save")}
                        >
                            {addCategory.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Check className="w-3.5 h-3.5" />
                            )}
                        </button>
                        <button
                            onClick={() => {
                                setNewCategoryOpen(false);
                                setNewCategoryName("");
                            }}
                            className="p-1 rounded-md hover:bg-[var(--background)] text-muted"
                            aria-label={t("common.cancel")}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setNewCategoryOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-[var(--background)] transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t("products.newCategory.button")}
                    </button>
                )}
                <button
                    onClick={() => setSuggesterOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-[var(--background)] transition-colors"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t("products.suggester.title")}
                </button>
                <button
                    onClick={allCollapsed ? expandAll : collapseAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-[var(--background)] transition-colors"
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
                        <CategorySection
                            key={key}
                            group={group}
                            isCollapsed={isCollapsed}
                            onToggleCollapse={() => toggleCollapse(group.id)}
                            onAddProducts={() =>
                                setQuickAssign({
                                    open: true,
                                    targetId: group.id,
                                    targetName: group.name,
                                })
                            }
                            t={t}
                        >
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
                                                        dndEnabled={dndEnabled}
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
                                                    className="mt-3 ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:text-foreground transition-colors rounded-lg hover:bg-[var(--background)]"
                                                >
                                                    {t("products.views.category.showAll")}{" "}
                                                    {group.products.length}
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {hasMore && isShowingAll && (
                                                <button
                                                    onClick={() => toggleShowAll(group.id)}
                                                    className="mt-3 ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors rounded-lg hover:bg-[var(--background)]"
                                                >
                                                    {t("products.views.category.collapseAll")}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CategorySection>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            {dndEnabled ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {content}
                    <DragOverlay>
                        {activeProduct ? (
                            <div className="relative flex items-center gap-3 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl opacity-95 max-w-xs">
                                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center">
                                    {activeProduct.image_url ? (
                                        <img
                                            src={activeProduct.image_url}
                                            alt={activeProduct.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <Package className="w-5 h-5 text-muted" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {activeProduct.name}
                                    </p>
                                    <span className="text-xs font-semibold text-[var(--foreground)]">
                                        {formatIQD(activeProduct.price)}
                                    </span>
                                </div>
                                {activeDragCount > 1 && (
                                    <span className="absolute -top-2 -right-2 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold flex items-center justify-center shadow-lg">
                                        +{activeDragCount - 1}
                                    </span>
                                )}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            ) : (
                content
            )}

            {/* Quick assign panel */}
            <CategoryQuickAssignPanel
                open={quickAssign.open}
                onOpenChange={(open) =>
                    setQuickAssign((prev) => ({ ...prev, open }))
                }
                targetCategoryId={quickAssign.targetId}
                targetCategoryName={quickAssign.targetName}
                products={products}
            />

            {/* Suggester */}
            <CategorySuggester
                open={suggesterOpen}
                onOpenChange={setSuggesterOpen}
                products={products}
                categories={categories}
            />

            {/* Bulk confirm dialog */}
            <BulkCategoryConfirmDialog
                open={bulkDialog.open}
                onOpenChange={(open) =>
                    setBulkDialog((prev) => ({ ...prev, open }))
                }
                productIds={bulkDialog.productIds}
                targetCategoryId={bulkDialog.targetCategoryId}
                targetCategoryName={bulkDialog.targetCategoryName}
                previewNames={bulkDialog.previewNames}
                onConfirmed={() => clearSelection()}
            />
        </>
    );
}

/* ─── Category Section (droppable header wrapper) ─── */

interface CategorySectionProps {
    group: CategoryGroup;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onAddProducts: () => void;
    t: (key: string, params?: Record<string, any>) => string;
    children: React.ReactNode;
}

function CategorySection({
    group,
    isCollapsed,
    onToggleCollapse,
    onAddProducts,
    t,
    children,
}: CategorySectionProps) {
    const dropId = `category:${group.id ?? "__uncategorized__"}`;
    const { setNodeRef, isOver } = useDroppable({ id: dropId });

    return (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--card-shadow)] overflow-hidden">
            {/* Category header (droppable) */}
            <div
                ref={setNodeRef}
                className={cn(
                    "relative transition-all",
                    isOver && "ring-2 ring-[var(--pastel-yellow)] ring-inset"
                )}
            >
                <div
                    role="button"
                    tabIndex={0}
                    onClick={onToggleCollapse}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleCollapse();
                        }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors cursor-pointer"
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
                    <span className="font-semibold text-sm text-foreground">
                        {group.name}
                    </span>

                    {/* Stats */}
                    <div className="flex items-center gap-2 ml-auto text-xs text-muted">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-blue)] text-foreground font-medium">
                            {group.products.length}{" "}
                            {t("products.views.category.products")}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-yellow)] text-foreground font-medium">
                            {group.totalStock.toLocaleString()}{" "}
                            {t("products.views.category.units")}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[var(--pastel-green)] text-foreground font-medium">
                            {formatIQD(group.totalRevenue)}
                        </span>

                        {/* Add products button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddProducts();
                            }}
                            title={t("products.quickAssign.addButtonLabel")}
                            aria-label={t("products.quickAssign.addButtonLabel")}
                            className="p-1 rounded-md hover:bg-[var(--background)] text-[var(--foreground)] transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Drop-here floating label */}
                {isOver && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none px-3 py-1 rounded-full bg-[var(--pastel-yellow)] text-foreground text-xs font-semibold shadow-md">
                        {t("products.views.category.dropHere") ||
                            `Drop here — ${group.name}`}
                    </div>
                )}
            </div>

            {children}
        </div>
    );
}

/* ─── Mini Product Card ─── */

interface MiniProductCardProps {
    product: Product;
    isSelected: boolean;
    dndEnabled?: boolean;
    onToggleSelection: (id: string, event?: React.MouseEvent) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
}

function MiniProductCard({
    product,
    isSelected,
    dndEnabled = true,
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

    const {
        setNodeRef,
        listeners,
        attributes,
        isDragging,
    } = useDraggable({ id: product.id, disabled: !dndEnabled });

    return (
        <div
            ref={setNodeRef}
            {...(dndEnabled ? attributes : {})}
            {...(dndEnabled ? listeners : {})}
            className={cn(
                "relative group flex items-center gap-3 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] hover:shadow-[var(--card-shadow)] transition-all",
                dndEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                isSelected && "ring-2 ring-[var(--foreground)]",
                isDragging && "opacity-40"
            )}
            onClick={() => onViewDetails(product)}
        >
            {/* Selection checkbox */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(product.id, e);
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
                    onDuplicate={() => onDuplicate(product)}
                    onDelete={onDelete ? () => onDelete(product) : undefined}
                />
            </div>

            {/* Product image */}
            <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--card-bg)] flex items-center justify-center">
                {product.image_url ? (
                    <ProductThumb src={product.image_url} alt={product.name} sizes="48px" />
                ) : (
                    <Package className="w-5 h-5 text-muted" />
                )}
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                    {product.name}
                    <FillerBadge isFiller={product.is_filler} className="align-middle mr-1.5" />
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
        </div>
    );
}
