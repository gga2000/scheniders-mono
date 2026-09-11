"use client";

import React, { useRef, memo, useCallback, useEffect, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Order, MessageTemplate } from "@/lib/supabase";
import { SwipeableOrderCard } from "@/components/orders/swipeable-order-card";
import { RiskLevel } from "@/lib/fraud-detector";

interface VirtualizedOrderListProps {
    orders: Order[];
    loadingId: string | null;
    selectedOrders: Set<string>;
    messageTemplates: MessageTemplate[];
    // Callbacks
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    onToggleSelection: (orderId: string) => void;
    onTogglePin: (orderId: string) => void;
    onCloneOrder: (orderId: string) => void;
    onScreenshot: (order: Order) => void;
    onCancelWithReason: (order: Order) => void;
    onRejectWithReason: (order: Order) => void;
    onToggleReviewed: (orderId: string) => void;
    onOpenTemplatePanel: (order: Order) => void;
    onShowDuplicates: (order: Order) => void;
    onMergeWithPrevious: (currentOrderId: string, previousOrderId: string) => void;
    // Data helpers
    isBlacklisted: (phone: string) => boolean;
    getBlacklistEntry?: (phone: string) => import("@/hooks/use-order-auxiliary").BlacklistEntry | null;
    onAddToBlacklist?: (phone: string, reason: string, notes?: string) => Promise<void>;
    onRemoveFromBlacklist?: (phone: string) => Promise<void>;
    getRiskLevel: (phone: string) => RiskLevel;
    getRiskAssessment?: (phone: string) => any; // New helper for full assessment
    hasDuplicates?: (orderId: string) => boolean;
    getCustomerOrderCount: (phone: string, orderId: string) => number;
    getCustomerArchivedCount: (phone: string) => number;
    getCustomerHistory: (phone: string) => Order[];
    getReturnOrderInfo: (orderId: string) => { returnOrderId: string; returnSequenceNumber?: number } | null;
    getOriginalOrderInfo: (originalOrderId?: string) => { originalOrderId: string; originalSequenceNumber?: number } | null;
    // Options
    /**
     * PERF-2: render the cards as a virtualized responsive grid rather than a
     * single column. The number of lanes is read back from the browser's own
     * computed `grid-template-columns` instead of being re-derived from the
     * Tailwind breakpoints in JS, so the two cannot disagree.
     */
    gridMode?: boolean;
    /** Grid classes to apply, e.g. "grid gap-2 grid-cols-1 md:grid-cols-3". */
    gridClassName?: string;
    compactView?: 0 | 1 | 2;
    actionDock?: boolean;
    onSplitOrder?: (order: any) => void;
    // Assignments
    assignments?: any[];
}

// Estimated card heights (will be measured dynamically)
const ESTIMATED_CARD_HEIGHT = 180;
const COMPACT_CARD_HEIGHT = 100;
const ULTRA_COMPACT_CARD_HEIGHT = 56;

// A grid card is taller than the same card in a single column: it stacks the
// rows it would otherwise lay out side by side. Corrected by measureElement on
// the first paint; these only decide the initial scrollbar length.
const GRID_ROW_HEIGHT_COMPACT = 200;
const GRID_ROW_HEIGHT_ULTRA_COMPACT = 130;

// Tailwind `gap-2` between grid rows, `gap: 12` between stacked cards.
const GRID_ROW_GAP = 8;
const LIST_GAP = 12;

export const VirtualizedOrderList = memo(function VirtualizedOrderList({
    orders,
    loadingId,
    selectedOrders,
    messageTemplates,
    onStatusUpdate,
    onViewDetails,
    onToggleSelection,
    onTogglePin,
    onCloneOrder,
    onScreenshot,
    onCancelWithReason,
    onRejectWithReason,
    onToggleReviewed,
    onOpenTemplatePanel,
    onShowDuplicates,
    onMergeWithPrevious,
    isBlacklisted,
    getBlacklistEntry,
    onAddToBlacklist,
    onRemoveFromBlacklist,
    getCustomerOrderCount,
    getCustomerArchivedCount,
    getCustomerHistory,
    getReturnOrderInfo,
    getOriginalOrderInfo,
    gridMode = false,
    gridClassName = "",
    compactView = 0,
    actionDock = false,
    getRiskLevel,
    getRiskAssessment,
    hasDuplicates,
    onSplitOrder,
    assignments = [],
}: VirtualizedOrderListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const laneProbeRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [columns, setColumns] = useState(1);

    // Calculate scroll margin (distance from top of viewport to top of list)
    useEffect(() => {
        if (listRef.current) {
            const rect = listRef.current.getBoundingClientRect();
            setScrollMargin(rect.top + window.scrollY);
        }
    }, []);

    // PERF-2: how many cards fit across is whatever the browser decided, read
    // off an empty probe carrying the same grid classes. Deriving it from the
    // Tailwind breakpoints in JS instead would be a second copy of the layout
    // rules, and a wrong lane count is a visibly broken page rather than a
    // slightly slow one.
    useEffect(() => {
        const probe = laneProbeRef.current;
        if (!gridMode || !probe) {
            setColumns(1);
            return;
        }
        const measure = () => {
            const tracks = window
                .getComputedStyle(probe)
                .gridTemplateColumns.split(" ")
                .filter(Boolean).length;
            setColumns(Math.max(1, tracks));
            const rect = listRef.current?.getBoundingClientRect();
            if (rect) setScrollMargin(rect.top + window.scrollY);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(probe);
        return () => observer.disconnect();
    }, [gridMode, gridClassName]);

    const rowCount = gridMode ? Math.ceil(orders.length / columns) : orders.length;

    // Memoize the keys to prevent infinite loops from virtualizer config updates
    const getItemKey = useCallback(
        (index: number) => (gridMode ? `row-${index}` : orders[index]?.id || index),
        [orders, gridMode],
    );
    const estimateSize = useCallback(() => {
        if (gridMode) {
            return compactView === 2 ? GRID_ROW_HEIGHT_ULTRA_COMPACT : GRID_ROW_HEIGHT_COMPACT;
        }
        return compactView === 2 ? ULTRA_COMPACT_CARD_HEIGHT : compactView === 1 ? COMPACT_CARD_HEIGHT : ESTIMATED_CARD_HEIGHT;
    }, [compactView, gridMode]);

    // Use window-based virtualizer - cards scroll with the page
    const virtualizer = useWindowVirtualizer({
        count: rowCount,
        getItemKey,
        estimateSize,
        overscan: 5, // Render 5 extra items above/below viewport
        gap: gridMode ? GRID_ROW_GAP : LIST_GAP,
        scrollMargin,
    });

    const items = virtualizer.getVirtualItems();

    // Memoize callbacks to prevent re-renders
    const handleStatusUpdate = useCallback(onStatusUpdate, [onStatusUpdate]);
    const handleViewDetails = useCallback(onViewDetails, [onViewDetails]);

    const EMPTY_ARRAY: any[] = [];
    const orderAssignments = React.useMemo(() => {
        const map = new Map();
        assignments.forEach(a => {
            if (!map.has(a.order_id)) map.set(a.order_id, []);
            map.get(a.order_id).push(a);
        });
        return map;
    }, [assignments]);

    const renderCard = (order: Order) => {
        const customerOrders = getCustomerHistory(order.phone);
        const orderCount = getCustomerOrderCount(order.phone, order.order_id);
        const previousOrder = !order.is_return ? (customerOrders.find(o => o.id !== order.id) || null) : null;

        return (
            <SwipeableOrderCard
                key={order.id}
                order={order}
                loadingId={loadingId}
                onStatusUpdate={handleStatusUpdate}
                onViewDetails={handleViewDetails}
                isBlacklisted={isBlacklisted(order.phone)}
                blacklistEntry={getBlacklistEntry?.(order.phone)}
                onAddToBlacklist={onAddToBlacklist}
                onRemoveFromBlacklist={onRemoveFromBlacklist}
                riskLevel={getRiskLevel(order.phone)}
                riskAssessment={getRiskAssessment?.(order.phone)} // Pass full assessment
                customerOrderCount={orderCount}
                archivedOrderCount={getCustomerArchivedCount(order.phone)}
                hasDuplicates={hasDuplicates?.(order.id) || false}
                previousOrder={previousOrder}
                onMergeWithPrevious={onMergeWithPrevious}
                onShowDuplicates={onShowDuplicates}
                onTogglePin={onTogglePin}
                onCloneOrder={onCloneOrder}
                onScreenshot={onScreenshot}
                onCancelWithReason={onCancelWithReason}
                onRejectWithReason={onRejectWithReason}
                onToggleReviewed={onToggleReviewed}
                onSplit={onSplitOrder}
                returnOrderInfo={getReturnOrderInfo(order.id)}
                originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                compact={compactView}
                actionDock={actionDock}
                gridMode={gridMode}
                isVirtualized={true}
                onOpenTemplatePanel={onOpenTemplatePanel}
                messageTemplates={messageTemplates}
                isSelected={selectedOrders.has(order.id)}
                onToggleSelection={onToggleSelection}
                assignments={orderAssignments.get(order.id) || EMPTY_ARRAY}
            />
        );
    };

    if (orders.length === 0) {
        return null;
    }

    return (
        <div ref={listRef} className="relative w-full">
            {/* An empty grid carrying the same classes. It paints nothing; it
                exists so the lane count and any resize come from the browser's
                own layout rather than from a JS copy of the breakpoints. */}
            {gridMode && <div ref={laneProbeRef} className={gridClassName} aria-hidden style={{ height: 0 }} />}

            {/* Spacer div that reserves height for all virtual items */}
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {items.map((virtualRow) => {
                    const rowOrders = gridMode
                        ? orders.slice(virtualRow.index * columns, virtualRow.index * columns + columns)
                        : [orders[virtualRow.index]];
                    if (rowOrders.length === 0 || !rowOrders[0]) return null;

                    return (
                        <div
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                            }}
                        >
                            {gridMode ? (
                                <div className={gridClassName}>{rowOrders.map(renderCard)}</div>
                            ) : (
                                renderCard(rowOrders[0])
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

VirtualizedOrderList.displayName = "VirtualizedOrderList";
