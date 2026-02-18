"use client";

import { useRef, memo, useCallback, useEffect, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Order, MessageTemplate } from "@/lib/supabase";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
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
    getRiskLevel: (phone: string) => RiskLevel;
    getRiskAssessment?: (phone: string) => any; // New helper for full assessment
    getCustomerOrderCount: (phone: string, orderId: string) => number;
    getCustomerHistory: (phone: string) => Order[];
    getReturnOrderInfo: (orderId: string) => { returnOrderId: string; returnSequenceNumber?: number } | null;
    getOriginalOrderInfo: (originalOrderId?: string) => { originalOrderId: string; originalSequenceNumber?: number } | null;
    // Options
    compactView?: boolean;
    onSplitOrder?: (order: any) => void;
}

// Estimated card heights (will be measured dynamically)
const ESTIMATED_CARD_HEIGHT = 180;
const COMPACT_CARD_HEIGHT = 120;

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
    getCustomerOrderCount,
    getCustomerHistory,
    getReturnOrderInfo,
    getOriginalOrderInfo,
    compactView = false,
    getRiskLevel,
    getRiskAssessment,
    onSplitOrder,
}: VirtualizedOrderListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    // Calculate scroll margin (distance from top of viewport to top of list)
    useEffect(() => {
        if (listRef.current) {
            const rect = listRef.current.getBoundingClientRect();
            setScrollMargin(rect.top + window.scrollY);
        }
    }, []);

    // Use window-based virtualizer - cards scroll with the page
    const virtualizer = useWindowVirtualizer({
        count: orders.length,
        estimateSize: () => compactView ? COMPACT_CARD_HEIGHT : ESTIMATED_CARD_HEIGHT,
        overscan: 5, // Render 5 extra items above/below viewport
        gap: 12, // Gap between items
        scrollMargin,
    });

    const items = virtualizer.getVirtualItems();

    // Memoize callbacks to prevent re-renders
    const handleStatusUpdate = useCallback(onStatusUpdate, [onStatusUpdate]);
    const handleViewDetails = useCallback(onViewDetails, [onViewDetails]);

    if (orders.length === 0) {
        return null;
    }

    return (
        <div ref={listRef} className="relative w-full">
            {/* Spacer div that reserves height for all virtual items */}
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {items.map((virtualRow) => {
                    const order = orders[virtualRow.index];
                    const customerOrders = getCustomerHistory(order.phone);
                    const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                    const previousOrder = customerOrders.find(o => o.id !== order.id) || null;

                    return (
                        <div
                            key={order.id}
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
                            <SwipeableOrderCard
                                order={order}
                                loadingId={loadingId}
                                onStatusUpdate={handleStatusUpdate}
                                onViewDetails={handleViewDetails}
                                isBlacklisted={isBlacklisted(order.phone)}
                                riskLevel={getRiskLevel(order.phone)}
                                riskAssessment={getRiskAssessment?.(order.phone)} // Pass full assessment
                                customerOrderCount={orderCount}
                                previousOrder={previousOrder}
                                onMergeWithPrevious={onMergeWithPrevious}
                                onShowDuplicates={onShowDuplicates}
                                onTogglePin={onTogglePin}
                                onCloneOrder={onCloneOrder}
                                onScreenshot={onScreenshot}
                                onCancelWithReason={onCancelWithReason}
                                onRejectWithReason={onRejectWithReason}
                                onToggleReviewed={onToggleReviewed}
                                onSplit={() => onSplitOrder && onSplitOrder(order)}
                                returnOrderInfo={getReturnOrderInfo(order.id)}
                                originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                compact={compactView}
                                onOpenTemplatePanel={onOpenTemplatePanel}
                                messageTemplates={messageTemplates}
                                isSelected={selectedOrders.has(order.id)}
                                onToggleSelection={onToggleSelection}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

VirtualizedOrderList.displayName = "VirtualizedOrderList";
