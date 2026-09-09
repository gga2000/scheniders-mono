"use client";

import React, { useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Order, MessageTemplate } from "@/lib/supabase";
import { RiskLevel } from "@/lib/fraud-detector";
import { OrderCard } from "./order-card";
import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface SwipeableOrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    riskLevel?: RiskLevel;
    riskAssessment?: any; // Pass through risk assessment
    // ... all other props pass through
    [key: string]: any;
}

const SWIPE_THRESHOLD = 80;

export const SwipeableOrderCard = memo(function SwipeableOrderCard(props: SwipeableOrderCardProps) {
    const {
        order,
        onStatusUpdate,
        onViewDetails,
        onCancelWithReason,
        onRejectWithReason
    } = props;

    const isMobile = useIsMobile();
    const x = useMotionValue(0);
    const bgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [1, 0, 1]);
    const bgColor = useTransform(x, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], ["#FCA5A5", "rgba(255,255,255,0)", "#86EFAC"]); // Red to Transparent to Green

    // Determine actions based on status
    const canConfirm = order.status === "new" || order.status === "contacted";
    const canCancel = ["new", "contacted", "confirmed", "in_transit"].includes(order.status);

    const handleDragEnd = async (_: unknown, info: PanInfo) => {
        const offset = info.offset.x;

        if (offset > SWIPE_THRESHOLD && canConfirm) {
            // MOB-5: swiping right committed a status change silently, while
            // swiping left opened a reason dialog — an accidental brush of the
            // card confirmed an order with no acknowledgement and nothing on
            // screen to reverse it. The gesture is kept (it is the point of the
            // card) but it now announces itself and offers the inverse, using
            // the status the order was actually on rather than assuming "new".
            const previousStatus = order.status;
            await onStatusUpdate(order.id, "confirmed");
            toast.success("Order confirmed", {
                description: `#${order.order_id} — swiped right`,
                duration: 10000,
                action: {
                    label: "Undo",
                    onClick: () => onStatusUpdate(order.id, previousStatus),
                },
            });
        } else if (offset < -SWIPE_THRESHOLD && canCancel) {
            // Swiped Left -> Cancel/Reject (already asks for a reason)
            if (onCancelWithReason) onCancelWithReason(order);
        }
    };

    if (!isMobile) {
        return <OrderCard {...props} />;
    }

    return (
        <div className="relative rounded-[20px]">
            {/* Background Layers */}
            <motion.div
                style={{ backgroundColor: bgColor, opacity: bgOpacity }}
                className="absolute inset-0 z-0 flex items-center justify-between px-6 pointer-events-none rounded-[20px] overflow-hidden"
            >
                {/* Left Side (for Positive Drag) -> Confirm */}
                <div className="flex items-center gap-2 text-green-800 font-bold">
                    <CheckCircle className="w-6 h-6" />
                    <span>Confirm</span>
                </div>

                {/* Right Side (for Negative Drag) -> Cancel */}
                <div className="flex items-center gap-2 text-red-900 font-bold">
                    <span>Cancel</span>
                    <XCircle className="w-6 h-6" />
                </div>
            </motion.div>

            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2} // bouncy feel
                onDragEnd={handleDragEnd}
                style={{ x }}
                className="relative z-10"
                whileTap={{ cursor: "grabbing" }}
            >
                <OrderCard {...props} />
            </motion.div>
        </div>
    );
});

SwipeableOrderCard.displayName = "SwipeableOrderCard";
