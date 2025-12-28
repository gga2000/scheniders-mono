"use client";

import React, { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Order, MessageTemplate } from "@/lib/supabase";
import { OrderCard } from "./order-card";
import {
    MessageCircle,
    Edit,
    Copy,
    CheckCircle,
    PhoneCall,
    Truck,
    XCircle,
    Ban,
    Camera
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copyOrderToClipboard, generateWhatsAppLink } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SwipeableOrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    isBlacklisted?: boolean;
    customerOrderCount?: number;
    previousOrder?: Order | null;
    onMergeWithPrevious?: (currentOrderId: string, previousOrderId: string) => void;
    onShowDuplicates?: (order: Order) => void;
    onTogglePin?: (orderId: string) => void;
    onCloneOrder?: (orderId: string) => void;
    onScreenshot?: (order: Order) => void;
    onCancelWithReason?: (order: Order) => void;
    onRejectWithReason?: (order: Order) => void;
    onToggleReviewed?: (orderId: string) => void;
    returnOrderInfo?: { returnOrderId: string; returnSequenceNumber?: number } | null;
    originalOrderInfo?: { originalOrderId: string; originalSequenceNumber?: number } | null;
    compact?: boolean;
    onOpenTemplatePanel?: (order: Order) => void;
    messageTemplates?: MessageTemplate[];
    isSelected?: boolean;
    onToggleSelection?: (orderId: string) => void;
}

// Swipe threshold in pixels
const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH = 80;

export function SwipeableOrderCard(props: SwipeableOrderCardProps) {
    const { order, onStatusUpdate, onViewDetails, onOpenTemplatePanel, messageTemplates = [], onScreenshot, onCancelWithReason, onRejectWithReason } = props;
    const isMobile = useIsMobile();
    const [isSwipedLeft, setIsSwipedLeft] = useState(false);
    const [isSwipedRight, setIsSwipedRight] = useState(false);
    const x = useMotionValue(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Transform for background action visibility
    const leftActionsOpacity = useTransform(x, [-ACTION_WIDTH * 2, -ACTION_WIDTH, 0], [1, 0.8, 0]);
    const rightActionsOpacity = useTransform(x, [0, ACTION_WIDTH, ACTION_WIDTH * 2], [0, 0.8, 1]);

    // Get next status action based on current status
    const getNextStatusAction = () => {
        switch (order.status) {
            case "new":
                return { status: "contacted" as const, label: "اتصال", icon: PhoneCall, color: "bg-amber-500" };
            case "contacted":
                return { status: "confirmed" as const, label: "تأكيد", icon: CheckCircle, color: "bg-green-500" };
            case "confirmed":
                return { status: "in_transit" as const, label: "شحن", icon: Truck, color: "bg-blue-500" };
            case "in_transit":
                return { status: "delivered" as const, label: "تسليم", icon: CheckCircle, color: "bg-emerald-500" };
            case "delivered":
                return { status: "completed" as const, label: "إكمال", icon: CheckCircle, color: "bg-teal-500" };
            default:
                return null;
        }
    };

    const nextAction = getNextStatusAction();
    const isValidPhone = validatePhoneDetailed(order.phone).isValid;

    const handleDragEnd = (_: any, info: PanInfo) => {
        const swipeDistance = info.offset.x;
        const velocity = info.velocity.x;

        // Left swipe - show right actions (WhatsApp, Edit, Copy)
        if (swipeDistance < -SWIPE_THRESHOLD || velocity < -500) {
            setIsSwipedLeft(true);
            setIsSwipedRight(false);
        }
        // Right swipe - show left actions (Status)
        else if (swipeDistance > SWIPE_THRESHOLD || velocity > 500) {
            setIsSwipedRight(true);
            setIsSwipedLeft(false);
        }
        // Reset
        else {
            setIsSwipedLeft(false);
            setIsSwipedRight(false);
        }
    };

    const resetSwipe = () => {
        setIsSwipedLeft(false);
        setIsSwipedRight(false);
    };

    const handleWhatsApp = () => {
        if (!isValidPhone) return;
        if (onOpenTemplatePanel && messageTemplates.length > 0) {
            onOpenTemplatePanel(order);
        } else {
            const link = generateWhatsAppLink(
                order.phone,
                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
            );
            window.open(link, "_blank");
        }
        resetSwipe();
    };

    const handleCopy = async () => {
        await copyOrderToClipboard(order);
        resetSwipe();
    };

    const handleEdit = () => {
        onViewDetails(order);
        resetSwipe();
    };

    const handleStatusChange = () => {
        if (nextAction) {
            onStatusUpdate(order.id, nextAction.status);
            resetSwipe();
        }
    };

    // On desktop, render regular OrderCard
    if (!isMobile) {
        return <OrderCard {...props} />;
    }

    return (
        <div ref={containerRef} className="relative overflow-hidden rounded-[20px]">
            {/* Left Actions (shown when swiping right) - Status */}
            <motion.div
                style={{ opacity: rightActionsOpacity }}
                className={cn(
                    "absolute inset-y-0 left-0 flex items-center justify-start pl-4",
                    nextAction?.color || "bg-green-500",
                    "rounded-l-[20px]"
                )}
            >
                {nextAction && (
                    <button
                        onClick={handleStatusChange}
                        className="flex flex-col items-center justify-center w-16 h-full text-white"
                    >
                        <nextAction.icon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">{nextAction.label}</span>
                    </button>
                )}
            </motion.div>

            {/* Right Actions (shown when swiping left) - WhatsApp, Edit, Copy */}
            <motion.div
                style={{ opacity: leftActionsOpacity }}
                className="absolute inset-y-0 right-0 flex items-center justify-end rounded-r-[20px] bg-gradient-to-l from-gray-100 to-transparent"
            >
                <div className="flex items-center gap-1 pr-2">
                    {/* Copy */}
                    <button
                        onClick={handleCopy}
                        className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-green-100 text-green-700"
                    >
                        <Copy className="w-5 h-5" />
                        <span className="text-[10px] mt-0.5">نسخ</span>
                    </button>

                    {/* Screenshot */}
                    {onScreenshot && (
                        <button
                            onClick={() => { onScreenshot(order); resetSwipe(); }}
                            className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-violet-100 text-violet-700"
                        >
                            <Camera className="w-5 h-5" />
                            <span className="text-[10px] mt-0.5">مشاركة</span>
                        </button>
                    )}

                    {/* Edit */}
                    <button
                        onClick={handleEdit}
                        className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-blue-100 text-blue-700"
                    >
                        <Edit className="w-5 h-5" />
                        <span className="text-[10px] mt-0.5">تفاصيل</span>
                    </button>

                    {/* WhatsApp */}
                    <button
                        onClick={handleWhatsApp}
                        disabled={!isValidPhone}
                        className={cn(
                            "flex flex-col items-center justify-center w-14 h-14 rounded-xl",
                            isValidPhone ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                        )}
                    >
                        <MessageCircle className="w-5 h-5" />
                        <span className="text-[10px] mt-0.5">واتساب</span>
                    </button>
                </div>
            </motion.div>

            {/* Draggable Card */}
            <motion.div
                drag="x"
                dragConstraints={{ left: -ACTION_WIDTH * 3, right: ACTION_WIDTH * 1.5 }}
                dragElastic={0.1}
                onDragEnd={handleDragEnd}
                animate={{
                    x: isSwipedLeft ? -ACTION_WIDTH * 2.5 : isSwipedRight ? ACTION_WIDTH * 1.2 : 0
                }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                style={{ x }}
                className="relative z-10"
                onClick={(e) => {
                    // If swiped, clicking resets. Otherwise, open details
                    if (isSwipedLeft || isSwipedRight) {
                        e.stopPropagation();
                        resetSwipe();
                    }
                }}
            >
                <OrderCard
                    {...props}
                // Disable the built-in mobile expand on swipeable cards
                />
            </motion.div>

            {/* Swipe indicator overlay when swiped */}
            {(isSwipedLeft || isSwipedRight) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-20 pointer-events-none"
                    style={{
                        background: isSwipedLeft
                            ? "linear-gradient(to left, rgba(0,0,0,0.05), transparent)"
                            : "linear-gradient(to right, rgba(0,0,0,0.05), transparent)"
                    }}
                />
            )}
        </div>
    );
}
