"use client";

import React, { useRef, useState, useCallback, memo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { motion, useAnimation } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Order } from "@/lib/supabase";
import { MobileOrderCard } from "./MobileOrderCard";
import { useOrderRiskQuery } from "@/hooks/use-order-risk-query";

interface MobileOrdersListProps {
    orders: Order[];
    onRefresh: () => Promise<void>;
    onViewDetails: (order: Order) => void;
    onStatusUpdate: (id: string, status: Order["status"]) => void;
    getCustomerArchivedCount: (phone: string) => number;
    getCustomerOrderCount: (phone: string, currentOrderId?: string) => number;
    hasDuplicates: (orderId: string) => boolean;
    onOpenTemplatePanel?: (order: Order) => void;
}

export const MobileOrdersList = memo(function MobileOrdersList({
    orders,
    onRefresh,
    onViewDetails,
    onStatusUpdate,
    getCustomerArchivedCount,
    getCustomerOrderCount,
    hasDuplicates,
    onOpenTemplatePanel,
}: MobileOrdersListProps) {
    const listRef = useRef<HTMLDivElement>(null);

    // Pull-to-refresh state
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullY, setPullY] = useState(0);
    const controls = useAnimation();

    const startY = useRef(0);
    const isPulling = useRef(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        // Only allow pull to refresh if we are at the top of the page
        if (window.scrollY <= 0) {
            startY.current = e.touches[0].clientY;
            isPulling.current = true;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling.current || isRefreshing) return;

        const y = e.touches[0].clientY;
        const diff = y - startY.current;

        if (diff > 0) {
            // Add resistance
            const pull = Math.min(diff * 0.4, 80);
            setPullY(pull);
            if (pull > 0) {
                // Prevent default scrolling when pulling
                document.body.style.overflow = 'hidden';
            }
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current) return;

        isPulling.current = false;
        document.body.style.overflow = '';

        if (pullY > 60 && !isRefreshing) {
            setIsRefreshing(true);
            controls.start({ top: 16 }); // Keep spinner visible

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullY(0);
                controls.start({ top: -50 });
            }
        } else {
            setPullY(0);
            controls.start({ top: -50 });
        }
    };

    // Virtualization
    // PERF-D1: shares the ["orders","risk"] query key with the page, so this is
    // the same cached fetch, not a second one.
    const riskByOrderId = useOrderRiskQuery();
    const estimateSize = useCallback(() => 160, []); // Estimated height of MobileOrderCard including gap

    const virtualizer = useWindowVirtualizer({
        count: orders.length,
        estimateSize,
        overscan: 5,
        gap: 12,
    });

    const items = virtualizer.getVirtualItems();

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Loader2 className="w-8 h-8 text-muted-foreground opacity-20" />
                </div>
                <h3 className="text-lg font-semibold mb-1">لا توجد طلبات</h3>
                <p className="text-sm text-muted-foreground">لم يتم العثور على طلبات تطابق معايير البحث.</p>
            </div>
        );
    }

    return (
        <div
            className="relative w-full"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull to refresh indicator */}
            <motion.div
                animate={controls}
                initial={{ top: -50 }}
                style={{ y: pullY, x: "-50%" }}
                className="fixed left-1/2 z-50 flex items-center justify-center w-10 h-10 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-gray-100 dark:border-zinc-700 pointer-events-none"
            >
                <Loader2
                    className="w-5 h-5 text-primary"
                    style={{
                        transform: `rotate(${pullY * 3}deg)`,
                        animation: isRefreshing ? "spin 1s linear infinite" : "none"
                    }}
                />
            </motion.div>

            <div ref={listRef} className="w-full px-4" style={{ paddingBottom: '20px' }}>
                <div
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                    }}
                >
                    {items.map((virtualRow) => {
                        const order = orders[virtualRow.index];
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
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <MobileOrderCard
                                    order={order}
                                    onViewDetails={onViewDetails}
                                    onStatusUpdate={onStatusUpdate}
                                    customerOrderCount={getCustomerOrderCount(order.phone, order.order_id)}
                                    archivedOrderCount={getCustomerArchivedCount(order.phone)}
                                    hasDuplicates={hasDuplicates(order.id)}
                                    riskLevel={riskByOrderId.get(order.id)?.level}
                                    onOpenTemplatePanel={onOpenTemplatePanel}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

MobileOrdersList.displayName = "MobileOrdersList";
