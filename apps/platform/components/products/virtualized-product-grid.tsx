"use client";

import { useRef, useCallback, useMemo, useState, useEffect, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderOpen } from "lucide-react";
import { Product } from "@/lib/supabase";
import { ProductGridCard } from "./product-grid-card";
import { SwipeableCard } from "./swipeable-card";
import { computeColumnCount, type GridDensity } from "./density-toggle";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";

interface Category {
    id: string;
    name: string;
    image_url?: string | null;
}

interface VirtualizedProductGridProps {
    products: Product[];
    selectedIds: Set<string>;
    categoriesMap: Map<string, string>;
    onToggleSelection: (id: string) => void;
    onViewDetails: (product: Product) => void;
    onEdit: (product: Product) => void;
    onArchive: (id: string) => void;
    onRestore: (id: string) => void;
    onDuplicate: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
    onReorder?: (updates: { id: string; display_order: number }[]) => void;
    density?: GridDensity;
    groupByCategory?: boolean;
    categories?: Category[];
}

function useColumnCount(density: GridDensity) {
    const [columnCount, setColumnCount] = useState(() =>
        typeof window === "undefined" ? 5 : computeColumnCount(window.innerWidth, density)
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setColumnCount(computeColumnCount(window.innerWidth, density));
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [density]);

    return columnCount;
}

function SortableGridItem({
    product,
    children,
}: {
    product: Product;
    children: (props: { listeners: any; isDragging: boolean }) => React.ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: product.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {children({ listeners, isDragging })}
        </div>
    );
}

/** Row item types used when groupByCategory is ON. */
type HeaderRow = { type: "header"; categoryId: string | null; categoryName: string; count: number };
type ProductRow = { type: "products"; categoryId: string | null; products: Product[] };
type VirtualRow = HeaderRow | ProductRow;

export function VirtualizedProductGrid({
    products,
    selectedIds,
    categoriesMap,
    onToggleSelection,
    onViewDetails,
    onEdit,
    onArchive,
    onRestore,
    onDuplicate,
    onDelete,
    onVisibilityToggle,
    onReorder,
    density = "normal",
    groupByCategory = false,
    categories,
}: VirtualizedProductGridProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const columnCount = useColumnCount(density);
    const isMobile = columnCount === 1;
    // Swipe archives or opens the editor, so viewers get no swipe.
    const { can } = usePermission();
    const swipeDisabled = !isMobile || !can(PERMISSIONS.EDIT_PRODUCTS);
    const { t } = useLanguage();

    useLayoutEffect(() => {
        const el = parentRef.current;
        if (!el) return;
        const update = () => {
            const next = el.offsetTop;
            setScrollMargin((prev) => (prev === next ? prev : next));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(document.documentElement);
        window.addEventListener("resize", update);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);

    const [activeProduct, setActiveProduct] = useState<Product | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    /**
     * When grouped, reorder is scoped to siblings within the SAME category so dropping
     * across categories doesn't silently mutate display_order out of range.
     */
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const product = products.find((p) => p.id === event.active.id);
        if (product) setActiveProduct(product);
    }, [products]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveProduct(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !onReorder) return;

        const activeProd = products.find((p) => p.id === active.id);
        const overProd = products.find((p) => p.id === over.id);
        if (!activeProd || !overProd) return;

        if (groupByCategory && activeProd.category_id !== overProd.category_id) {
            // Cross-category drop — ignore; moving categories needs a different mutation.
            return;
        }

        const scope = groupByCategory
            ? products.filter((p) => p.category_id === activeProd.category_id)
            : products;

        const oldIndex = scope.findIndex((p) => p.id === active.id);
        const newIndex = scope.findIndex((p) => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const minIdx = Math.min(oldIndex, newIndex);
        const maxIdx = Math.max(oldIndex, newIndex);
        const reordered = [...scope];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        // Preserve each scope product's current display_order as its "slot index" so
        // we don't clobber ordering across the whole list when scoped to a category.
        const slots = scope.map((p) => p.display_order ?? scope.indexOf(p));
        const updates: { id: string; display_order: number }[] = [];
        for (let i = minIdx; i <= maxIdx; i++) {
            updates.push({ id: reordered[i].id, display_order: slots[i] });
        }
        onReorder(updates);
    }, [products, onReorder, groupByCategory]);

    // ── Row planning ──────────────────────────────────────────────────────────
    // When grouped: interleave header rows with product rows (chunked by columnCount).
    // When flat: plain chunked product rows.
    const rows = useMemo<VirtualRow[]>(() => {
        if (!groupByCategory) {
            const result: ProductRow[] = [];
            for (let i = 0; i < products.length; i += columnCount) {
                result.push({
                    type: "products",
                    categoryId: null,
                    products: products.slice(i, i + columnCount),
                });
            }
            return result;
        }

        // Group → Map<categoryId|null, Product[]>, sort desc by count, uncategorized last.
        const groups = new Map<string | null, Product[]>();
        for (const p of products) {
            const key = p.category_id ?? null;
            const arr = groups.get(key);
            if (arr) arr.push(p);
            else groups.set(key, [p]);
        }

        const catName = (id: string | null): string => {
            if (!id) return t("products.views.category.uncategorized");
            return categoriesMap.get(id) ?? t("products.views.category.uncategorized");
        };

        const ordered = Array.from(groups.entries()).sort(([aId, aArr], [bId, bArr]) => {
            if (aId === null) return 1; // uncategorized last
            if (bId === null) return -1;
            return bArr.length - aArr.length;
        });

        const result: VirtualRow[] = [];
        for (const [catId, items] of ordered) {
            result.push({
                type: "header",
                categoryId: catId,
                categoryName: catName(catId),
                count: items.length,
            });
            for (let i = 0; i < items.length; i += columnCount) {
                result.push({
                    type: "products",
                    categoryId: catId,
                    products: items.slice(i, i + columnCount),
                });
            }
        }
        return result;
    }, [products, columnCount, groupByCategory, categoriesMap, t]);

    const productIds = useMemo(() => products.map((p) => p.id), [products]);

    const rowVirtualizer = useWindowVirtualizer({
        count: rows.length,
        // Headers are ~56px, product rows ~480px — measureElement resolves the truth.
        estimateSize: (i) => (rows[i]?.type === "header" ? 56 : 480),
        overscan: 3,
        measureElement: (element) => element?.getBoundingClientRect().height ?? 480,
        scrollMargin,
    });

    const getCategoryName = useCallback(
        (product: Product) => {
            if (!product.category_id) return undefined;
            return categoriesMap.get(product.category_id);
        },
        [categoriesMap]
    );

    const renderProductRow = (rowProducts: Product[]) => (
        <div
            className="grid gap-4 pb-4"
            style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            }}
        >
            {rowProducts.map((product) =>
                onReorder ? (
                    <SortableGridItem key={product.id} product={product}>
                        {({ listeners, isDragging }) => (
                            <SwipeableCard
                                disabled={swipeDisabled}
                                onSwipeLeft={() => onArchive(product.id)}
                                onSwipeRight={() => onEdit(product)}
                            >
                                <ProductGridCard
                                    product={product}
                                    categoryName={getCategoryName(product)}
                                    isSelected={selectedIds.has(product.id)}
                                    onToggleSelection={onToggleSelection}
                                    onViewDetails={onViewDetails}
                                    onEdit={onEdit}
                                    onArchive={onArchive}
                                    onRestore={onRestore}
                                    onDuplicate={onDuplicate}
                                    onDelete={onDelete}
                                    onVisibilityToggle={onVisibilityToggle}
                                    dragListeners={listeners}
                                    isDragging={isDragging}
                                />
                            </SwipeableCard>
                        )}
                    </SortableGridItem>
                ) : (
                    <SwipeableCard
                        key={product.id}
                        disabled={swipeDisabled}
                        onSwipeLeft={() => onArchive(product.id)}
                        onSwipeRight={() => onEdit(product)}
                    >
                        <ProductGridCard
                            product={product}
                            categoryName={getCategoryName(product)}
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
                    </SwipeableCard>
                )
            )}
        </div>
    );

    const renderHeaderRow = (row: HeaderRow) => (
        <div className="pt-2 pb-3">
            <div className="flex items-center gap-3 px-1 border-b border-[var(--card-border)] pb-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--background)] flex items-center justify-center">
                    <FolderOpen className="w-3.5 h-3.5 text-muted" />
                </div>
                <span className="font-semibold text-sm text-foreground">{row.categoryName}</span>
                <span className="text-xs text-muted ml-1">
                    {t("products.groupByCategory.productCount", { count: row.count.toString() })}
                </span>
            </div>
        </div>
    );

    const renderGrid = () => (
        <div ref={parentRef} className="relative">
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                        <div
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                            }}
                        >
                            {row.type === "header"
                                ? renderHeaderRow(row)
                                : renderProductRow(row.products)}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // Suppress unused param lint while keeping Category import for external API contract.
    void categories;

    if (!onReorder) {
        return renderGrid();
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={productIds} strategy={rectSortingStrategy}>
                {renderGrid()}
            </SortableContext>
            <DragOverlay adjustScale={false}>
                {activeProduct && (
                    <div className="shadow-2xl rounded-[20px] opacity-90">
                        <ProductGridCard
                            product={activeProduct}
                            categoryName={getCategoryName(activeProduct)}
                            isSelected={selectedIds.has(activeProduct.id)}
                            onToggleSelection={() => {}}
                            onViewDetails={() => {}}
                            onEdit={() => {}}
                            onArchive={() => {}}
                            onRestore={() => {}}
                            onDuplicate={() => {}}
                            onDelete={() => {}}
                            onVisibilityToggle={() => {}}
                        />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
