"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { Product } from "@/lib/supabase";
import { ProductGridCard } from "./product-grid-card";
import { SwipeableCard } from "./swipeable-card";

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
    onDelete: (product: Product) => void;
    onVisibilityToggle: (product: Product) => void;
    onReorder?: (updates: { id: string; display_order: number }[]) => void;
}

function computeColumnCount(width: number): number {
    // Tailwind: sm=640, md=768, lg=1024, xl=1280
    if (width < 640) return 1;
    if (width < 768) return 2;
    if (width < 1024) return 3;
    if (width < 1280) return 4;
    return 5;
}

function useColumnCount() {
    const [columnCount, setColumnCount] = useState(() =>
        typeof window === "undefined" ? 5 : computeColumnCount(window.innerWidth)
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setColumnCount(computeColumnCount(window.innerWidth));
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

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
}: VirtualizedProductGridProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const columnCount = useColumnCount();
    const isMobile = columnCount === 1;

    const [activeProduct, setActiveProduct] = useState<Product | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const product = products.find((p) => p.id === event.active.id);
        if (product) setActiveProduct(product);
    }, [products]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveProduct(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !onReorder) return;

        const oldIndex = products.findIndex((p) => p.id === active.id);
        const newIndex = products.findIndex((p) => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        // Calculate new display_order values for affected range
        const minIdx = Math.min(oldIndex, newIndex);
        const maxIdx = Math.max(oldIndex, newIndex);
        const updates: { id: string; display_order: number }[] = [];

        // Create a reordered copy to compute new positions
        const reordered = [...products];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        for (let i = minIdx; i <= maxIdx; i++) {
            updates.push({ id: reordered[i].id, display_order: i });
        }

        onReorder(updates);
    }, [products, onReorder]);

    // Group products into rows based on column count
    const rows = useMemo(() => {
        const result: Product[][] = [];
        for (let i = 0; i < products.length; i += columnCount) {
            result.push(products.slice(i, i + columnCount));
        }
        return result;
    }, [products, columnCount]);

    const productIds = useMemo(() => products.map((p) => p.id), [products]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 480, // Fallback estimate; actual heights measured dynamically
        overscan: 3,
        measureElement: (element) => element?.getBoundingClientRect().height ?? 480,
    });

    const getCategoryName = useCallback(
        (product: Product) => {
            if (!product.category_id) return undefined;
            return categoriesMap.get(product.category_id);
        },
        [categoriesMap]
    );

    const renderGrid = () => (
        <div
            ref={parentRef}
            className="h-[calc(100vh-320px)] overflow-auto scrollbar-hide"
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowProducts = rows[virtualRow.index];
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
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
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
                                                    disabled={!isMobile}
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
                                            disabled={!isMobile}
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
                        </div>
                    );
                })}
            </div>
        </div>
    );

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
