"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
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
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Product } from "@/lib/supabase";
import { ProductListRow } from "./product-list-row";
import { SwipeableCard } from "./swipeable-card";

function SortableListItem({
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

interface VirtualizedProductListProps {
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

export function VirtualizedProductList({
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
}: VirtualizedProductListProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [activeProduct, setActiveProduct] = useState<Product | null>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const rowVirtualizer = useVirtualizer({
        count: products.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 84, // Fallback estimate; actual row heights measured dynamically
        overscan: 5,
        measureElement: (element) => element?.getBoundingClientRect().height ?? 84,
    });

    const getCategoryName = useCallback(
        (product: Product) => {
            if (!product.category_id) return undefined;
            return categoriesMap.get(product.category_id);
        },
        [categoriesMap]
    );

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

        const minIdx = Math.min(oldIndex, newIndex);
        const maxIdx = Math.max(oldIndex, newIndex);
        const updates: { id: string; display_order: number }[] = [];

        const reordered = [...products];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        for (let i = minIdx; i <= maxIdx; i++) {
            updates.push({ id: reordered[i].id, display_order: i });
        }

        onReorder(updates);
    }, [products, onReorder]);

    const productIds = useMemo(() => products.map((p) => p.id), [products]);

    const virtualRows = rowVirtualizer.getVirtualItems();

    const listContent = (
        <div
            style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
            }}
        >
            {virtualRows.map((virtualRow) => {
                const product = products[virtualRow.index];

                if (onReorder) {
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
                            <div className="pb-3">
                                <SortableListItem key={product.id} product={product}>
                                    {({ listeners, isDragging }) => (
                                        <SwipeableCard
                                            disabled={!isMobile}
                                            onSwipeLeft={() => onArchive(product.id)}
                                            onSwipeRight={() => onEdit(product)}
                                        >
                                            <ProductListRow
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
                                </SortableListItem>
                            </div>
                        </div>
                    );
                }

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
                        <div className="pb-3">
                            <SwipeableCard
                                disabled={!isMobile}
                                onSwipeLeft={() => onArchive(product.id)}
                                onSwipeRight={() => onEdit(product)}
                            >
                                <ProductListRow
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
                        </div>
                    </div>
                );
            })}
        </div>
    );

    if (onReorder) {
        return (
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={productIds} strategy={verticalListSortingStrategy}>
                    <div
                        ref={parentRef}
                        className="h-[calc(100vh-320px)] overflow-auto scrollbar-hide"
                    >
                        {listContent}
                    </div>
                </SortableContext>
                <DragOverlay adjustScale={false}>
                    {activeProduct && (
                        <div className="shadow-2xl rounded-[20px] opacity-90">
                            <ProductListRow
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

    return (
        <div
            ref={parentRef}
            className="h-[calc(100vh-320px)] overflow-auto scrollbar-hide"
        >
            {listContent}
        </div>
    );
}
