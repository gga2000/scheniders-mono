"use client";

import React, { useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Order, MessageTemplate } from "@/lib/supabase";
import { OrderCard } from "./order-card";
import {
    MessageCircle,
    CheckCircle,
    XCircle,
    Copy,
    MoreHorizontal,
    Camera,
    Pin,
    PhoneCall,
    Truck,
    Clock,
    Ban
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

// Double tap detection timing (ms)
const DOUBLE_TAP_DELAY = 300;

export const SwipeableOrderCard = memo(function SwipeableOrderCard(props: SwipeableOrderCardProps) {
    const {
        order,
        onStatusUpdate,
        onViewDetails,
        onOpenTemplatePanel,
        messageTemplates = [],
        onCancelWithReason,
        onRejectWithReason,
        onScreenshot,
        onTogglePin
    } = props;

    const isMobile = useIsMobile();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const lastTapRef = useRef<number>(0);
    const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isValidPhone = validatePhoneDetailed(order.phone).isValid;

    // Status actions matching desktop colors exactly
    const getStatusActions = () => {
        const actions: Array<{
            status: Order["status"];
            labelAr: string;
            icon: any;
            bgColor: string;
            textColor: string;
        }> = [];

        switch (order.status) {
            case "new":
                actions.push(
                    { status: "contacted", labelAr: "اتصال", icon: PhoneCall, bgColor: "bg-[var(--pastel-yellow)]", textColor: "text-amber-900" },
                    { status: "confirmed", labelAr: "تأكيد", icon: CheckCircle, bgColor: "bg-[var(--pastel-green)]", textColor: "text-green-900" },
                    { status: "cancelled", labelAr: "إلغاء", icon: XCircle, bgColor: "bg-[var(--pastel-pink)]", textColor: "text-rose-900" }
                );
                break;
            case "contacted":
                actions.push(
                    { status: "confirmed", labelAr: "تأكيد", icon: CheckCircle, bgColor: "bg-[var(--pastel-green)]", textColor: "text-green-900" },
                    { status: "no_response", labelAr: "لا رد", icon: Clock, bgColor: "bg-orange-100", textColor: "text-orange-900" },
                    { status: "cancelled", labelAr: "إلغاء", icon: XCircle, bgColor: "bg-[var(--pastel-pink)]", textColor: "text-rose-900" }
                );
                break;
            case "confirmed":
                actions.push(
                    { status: "in_transit", labelAr: "شحن", icon: Truck, bgColor: "bg-[var(--pastel-mint)]", textColor: "text-teal-900" },
                    { status: "cancelled", labelAr: "إلغاء", icon: XCircle, bgColor: "bg-[var(--pastel-pink)]", textColor: "text-rose-900" }
                );
                break;
            case "in_transit":
                actions.push(
                    { status: "delivered", labelAr: "تسليم", icon: Truck, bgColor: "bg-[var(--pastel-mint)]", textColor: "text-teal-900" },
                    { status: "cancelled", labelAr: "إلغاء", icon: XCircle, bgColor: "bg-[var(--pastel-pink)]", textColor: "text-rose-900" }
                );
                break;
            case "delivered":
                actions.push(
                    { status: "completed", labelAr: "إكمال", icon: CheckCircle, bgColor: "bg-[var(--pastel-green)]", textColor: "text-green-900" }
                );
                break;
            case "no_response":
                actions.push(
                    { status: "contacted", labelAr: "اتصال", icon: PhoneCall, bgColor: "bg-[var(--pastel-yellow)]", textColor: "text-amber-900" },
                    { status: "confirmed", labelAr: "تأكيد", icon: CheckCircle, bgColor: "bg-[var(--pastel-green)]", textColor: "text-green-900" },
                    { status: "cancelled", labelAr: "إلغاء", icon: XCircle, bgColor: "bg-[var(--pastel-pink)]", textColor: "text-rose-900" }
                );
                break;
        }

        return actions;
    };

    const statusActions = getStatusActions();

    // Handle double tap detection
    const handleTap = useCallback((e: React.MouseEvent) => {
        // Don't trigger if clicking on buttons or links
        if ((e.target as HTMLElement).closest('button, a')) return;

        const now = Date.now();
        const timeSinceLastTap = now - lastTapRef.current;

        if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
            // Double tap detected - toggle expansion
            if (tapTimeoutRef.current) {
                clearTimeout(tapTimeoutRef.current);
                tapTimeoutRef.current = null;
            }
            setIsExpanded(prev => !prev);
            setShowMoreMenu(false);
        } else {
            // Single tap - wait to see if it becomes double tap
            tapTimeoutRef.current = setTimeout(() => {
                // Single tap confirmed - open details
                onViewDetails(order);
            }, DOUBLE_TAP_DELAY);
        }

        lastTapRef.current = now;
    }, [order, onViewDetails]);

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
    };

    const handleStatusAction = async (status: Order["status"]) => {
        if (isProcessing) return;

        // For cancelled/rejected, use the reason dialogs if available
        if (status === "cancelled" && onCancelWithReason) {
            onCancelWithReason(order);
            return;
        }
        if (status === "rejected" && onRejectWithReason) {
            onRejectWithReason(order);
            return;
        }

        setIsProcessing(true);
        await onStatusUpdate(order.id, status);
        setIsProcessing(false);
    };

    const handleCopy = async () => {
        await copyOrderToClipboard(order);
        setShowMoreMenu(false);
    };

    const handleScreenshot = () => {
        if (onScreenshot) {
            onScreenshot(order);
            setShowMoreMenu(false);
        }
    };

    const handlePin = () => {
        if (onTogglePin) {
            onTogglePin(order.id);
            setShowMoreMenu(false);
        }
    };

    // On desktop, render regular OrderCard
    if (!isMobile) {
        return <OrderCard {...props} />;
    }

    return (
        <div
            className={cn(
                "relative bg-[var(--card-bg)] rounded-[20px] border-2 transition-all duration-200 overflow-hidden",
                isExpanded
                    ? "border-[var(--pastel-green)] shadow-lg shadow-green-500/10"
                    : "border-[var(--card-border)]"
            )}
        >
            {/* Order Card Content - Tappable */}
            <div onClick={handleTap} className="cursor-pointer">
                <OrderCard {...props} />
            </div>

            {/* Action Bar - Inside Card, Revealed on Double Tap */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="border-t border-[var(--card-border)] bg-[var(--background)]"
                    >
                        <div className="p-3 flex items-center gap-2 flex-wrap">
                            {/* WhatsApp Button - Green with icon */}
                            <button
                                onClick={handleWhatsApp}
                                disabled={!isValidPhone}
                                className={cn(
                                    "flex items-center justify-center w-11 h-11 rounded-xl transition-all active:scale-95",
                                    isValidPhone
                                        ? "bg-[var(--pastel-green)] text-green-700"
                                        : "bg-gray-100 text-gray-400"
                                )}
                            >
                                <MessageCircle className="w-5 h-5" />
                            </button>

                            {/* Status Action Buttons - Using exact desktop colors */}
                            {statusActions.map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.status}
                                        onClick={() => handleStatusAction(action.status)}
                                        disabled={isProcessing}
                                        className={cn(
                                            "flex items-center gap-1.5 px-4 h-11 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-50",
                                            action.bgColor,
                                            action.textColor
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span>{action.labelAr}</span>
                                    </button>
                                );
                            })}

                            {/* Spacer */}
                            <div className="flex-1" />

                            {/* More Button */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                                    className="flex items-center justify-center w-11 h-11 rounded-xl border border-gray-200 bg-white text-gray-600 transition-all active:scale-95"
                                >
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>

                                {/* More Menu Dropdown */}
                                <AnimatePresence>
                                    {showMoreMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute bottom-full right-0 mb-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
                                        >
                                            <button
                                                onClick={handleCopy}
                                                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                            >
                                                <Copy className="w-4 h-4" />
                                                <span>نسخ البيانات</span>
                                            </button>
                                            {onScreenshot && (
                                                <button
                                                    onClick={handleScreenshot}
                                                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                                >
                                                    <Camera className="w-4 h-4" />
                                                    <span>مشاركة صورة</span>
                                                </button>
                                            )}
                                            {onTogglePin && (
                                                <button
                                                    onClick={handlePin}
                                                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                                >
                                                    <Pin className="w-4 h-4" />
                                                    <span>{order.is_pinned ? "إلغاء التثبيت" : "تثبيت"}</span>
                                                </button>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Click outside to close more menu */}
            {showMoreMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMoreMenu(false)}
                />
            )}
        </div>
    );
});

SwipeableOrderCard.displayName = "SwipeableOrderCard";
