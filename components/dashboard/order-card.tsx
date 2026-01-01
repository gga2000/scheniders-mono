"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Order, OrderPriority, MessageTemplate } from "@/lib/supabase";
import { formatIQD, generateWhatsAppLink, getStatusLabel, copyOrderToClipboard, getGuaranteeDaysRemaining } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { cn } from "@/lib/utils";
import {
    MessageCircle,
    Edit,
    XCircle,
    Ban,
    MapPin,
    Phone,
    Package,
    PhoneCall,
    CheckCircle,
    Truck,
    Sparkles,
    AlertTriangle,
    Calendar,
    RotateCcw,
    Flag,
    Flame,
    FileText,
    Copy,
    Link2,
    Clock,
    Pin,
    CopyPlus,
    MoreVertical,
    Camera,
    ClipboardCopy,
} from "lucide-react";
import { motion } from "framer-motion";

interface OrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    isBlacklisted?: boolean;
    // Duplicate detection props
    customerOrderCount?: number;
    previousOrder?: Order | null;
    onMergeWithPrevious?: (currentOrderId: string, previousOrderId: string) => void;
    onShowDuplicates?: (order: Order) => void;
    // Pin functionality
    onTogglePin?: (orderId: string) => void;
    // Clone functionality
    onCloneOrder?: (orderId: string) => void;
    // Screenshot functionality
    onScreenshot?: (order: Order) => void;
    // Cancel with reason dialog
    onCancelWithReason?: (order: Order) => void;
    // Reject with reason dialog
    onRejectWithReason?: (order: Order) => void;
    // Toggle reviewed status for delivered orders
    onToggleReviewed?: (orderId: string) => void;
    // Return order info - if this order has a return, this contains the return order's info
    returnOrderInfo?: { returnOrderId: string; returnSequenceNumber?: number } | null;
    // Original order info - for return orders, this contains the original order's display info
    originalOrderInfo?: { originalOrderId: string; originalSequenceNumber?: number } | null;
    // Compact view
    compact?: boolean;
    // WhatsApp template panel
    onOpenTemplatePanel?: (order: Order) => void;
    messageTemplates?: MessageTemplate[];
    // Selection
    isSelected?: boolean;
    onToggleSelection?: (orderId: string) => void;
}

export function OrderCard({
    order,
    loadingId,
    onStatusUpdate,
    onViewDetails,
    isBlacklisted,
    customerOrderCount = 1,
    previousOrder,
    onMergeWithPrevious,
    onShowDuplicates,
    onTogglePin,
    onCloneOrder,
    onScreenshot,
    onCancelWithReason,
    onRejectWithReason,
    onToggleReviewed,
    returnOrderInfo,
    originalOrderInfo,
    compact = false,
    onOpenTemplatePanel,
    messageTemplates = [],
    isSelected = false,
    onToggleSelection,
}: OrderCardProps) {
    const isLoading = loadingId === order.id;
    const isNew = order.status === "new";
    const isReturn = order.is_return;
    const isUrgent = order.priority === "urgent";
    const isHighPriority = order.priority === "high";
    const hasDuplicates = customerOrderCount > 1;
    const isVerifiedCustomer = order.is_verified_customer === true;
    const isPinned = order.is_pinned;
    const isReviewed = order.is_reviewed;
    const isDelivered = order.status === "delivered";
    const hasRefund = !!returnOrderInfo;

    // More actions dropdown state
    const [actionsOpen, setActionsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
    const actionsRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);




    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                actionsRef.current &&
                !actionsRef.current.contains(target) &&
                menuRef.current &&
                !menuRef.current.contains(target)
            ) {
                setActionsOpen(false);
            }
        }
        if (actionsOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [actionsOpen]);

    // Format date as "12/3"
    const formatShortDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    // Format time as "03:12AM"
    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).replace(' ', '');
    };

    // Get relative time string for order age
    const getOrderAge = (dateStr: string) => {
        const now = new Date();
        const orderDate = new Date(dateStr);
        const diffMs = now.getTime() - orderDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return "1d ago";
        return `${diffDays}d ago`;
    };

    // Get urgency level based on order age (for pending/new orders)
    const getAgeUrgency = (dateStr: string) => {
        if (order.status === "delivered" || order.status === "rejected") return "none";

        const now = new Date();
        const orderDate = new Date(dateStr);
        const diffHours = (now.getTime() - orderDate.getTime()) / 3600000;

        if (diffHours < 2) return "fresh";      // Green - just arrived
        if (diffHours < 4) return "normal";     // Default - normal processing
        if (diffHours < 8) return "attention";  // Yellow - needs attention
        if (diffHours < 24) return "urgent";    // Orange - getting old
        return "stale";                         // Red - very old
    };

    const orderAge = getOrderAge(order.created_at);
    const ageUrgency = getAgeUrgency(order.created_at);

    const getItemsDisplay = (items: any[]) => {
        if (!items || items.length === 0) return [];
        return items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            image_url: item.image_url,
            tag_color: item.tag_color
        }));
    };

    // Get address from address_details or city
    const getFullAddress = () => {
        const parts = [];
        if (order.city) parts.push(order.city);
        if (order.address_details && order.address_details.trim().length > 0) {
            parts.push(order.address_details);
        }
        return parts.join(' • ');
    };

    // Get notes directly (no longer contains address)
    const getActualNotes = () => {
        return order.notes?.trim() || '';
    };

    const fullAddress = getFullAddress();
    const actualNotes = getActualNotes();

    // Soft pastel status colors - reassigned (with return order override)
    const getStatusColor = () => {
        if (isReturn) return "bg-red-400"; // Red for return orders
        switch (order.status) {
            case "new": return "bg-orange-300"; // Warm coral for new
            case "contacted": return "bg-[var(--pastel-yellow)]"; // Yellow for contacted
            case "confirmed": return "bg-[var(--pastel-green)]"; // Green for confirmed
            case "delivered": return "bg-[var(--pastel-mint)]"; // Mint/Blue for delivered
            case "rejected": return "bg-[var(--pastel-pink)]"; // Pink/Red for rejected
            case "return_pending": return "bg-rose-400"; // Rose for return pending
            case "cancelled": return "bg-red-300"; // Red for cancelled
            default: return "bg-[var(--card-border)]";
        }
    };

    // Priority badge styling
    const getPriorityBadge = () => {
        if (order.priority === "urgent") {
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-red-100 text-red-700 uppercase tracking-wider animate-pulse">
                    <Flame className="w-3 h-3" />
                    Urgent
                </span>
            );
        }
        if (order.priority === "high") {
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                    <Flag className="w-3 h-3" />
                    High
                </span>
            );
        }
        return null;
    };

    const getStatusBadgeStyle = () => {
        switch (order.status) {
            case "new": return "bg-orange-200 text-orange-900";
            case "contacted": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "confirmed": return "bg-[var(--pastel-green)] text-green-900";
            case "cancelled": return "bg-red-200 text-red-900";
            case "in_transit": return "bg-blue-200 text-blue-900";
            case "delivered": return "bg-[var(--pastel-mint)] text-teal-900";
            case "rejected": return "bg-[var(--pastel-pink)] text-rose-900";
            case "completed": return "bg-emerald-200 text-emerald-900 ring-2 ring-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
            case "no_response": return "bg-slate-200 text-slate-600";
            case "return_pending": return "bg-rose-200 text-rose-900 ring-2 ring-rose-400/50";
            default: return "bg-gray-100 text-gray-700";
        }
    };

    // Source badge with icons
    const getSourceBadge = () => {
        if (!order.source) return null;

        switch (order.source) {
            case "whatsapp":
                return (
                    <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">
                        {/* WhatsApp official logo - green circle with phone */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#25D366">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                    </span>
                );
            case "lightfunnels":
                return (
                    <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold rounded-full bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 text-purple-700 border border-purple-200">
                        {/* LightFunnels logo - colorful arrow shape */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <path d="M3 21L9 3L15 15L21 3" stroke="url(#lf-gradient-badge)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            <defs>
                                <linearGradient id="lf-gradient-badge" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#EC4899" />
                                    <stop offset="0.5" stopColor="#8B5CF6" />
                                    <stop offset="1" stopColor="#3B82F6" />
                                </linearGradient>
                            </defs>
                        </svg>
                        LightFunnels
                    </span>
                );
            case "meta":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                        Meta
                    </span>
                );
            case "tiktok":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-gray-900 text-white">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                        </svg>
                        TikTok
                    </span>
                );
            default:
                return null;
        }
    };

    const items = getItemsDisplay(order.items || []);

    return (
        <motion.div
            layoutId={`order-card-${order.id}-${order.status}`}
            className={cn(
                "group relative w-full",
                order.status === "rejected" && "opacity-60"
            )}
            transition={{
                layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
            }}
        >
            {/* Soft glow effect for new orders */}
            {isNew && (
                <div className="absolute -inset-0.5 bg-orange-300 rounded-[22px] blur-md opacity-50 group-hover:opacity-70 transition-opacity animate-pulse" />
            )}
            {/* Glow effect for urgent orders */}
            {isUrgent && !isReturn && (
                <div className="absolute -inset-0.5 bg-red-400 rounded-[22px] blur-md opacity-40 group-hover:opacity-60 transition-opacity animate-pulse" />
            )}
            {/* Glow effect for return orders */}
            {isReturn && (
                <div className="absolute -inset-0.5 bg-red-400 rounded-[22px] blur-md opacity-40 group-hover:opacity-60 transition-opacity" />
            )}
            {/* Glow for returning customers - orange if unverified, green if verified */}
            {hasDuplicates && !isReturn && !isUrgent && !isPinned && (
                <div className={cn(
                    "absolute -inset-0.5 rounded-[22px] blur-md transition-opacity",
                    isVerifiedCustomer
                        ? "bg-emerald-400 opacity-30 group-hover:opacity-50"
                        : "bg-orange-400 opacity-50 group-hover:opacity-70 animate-pulse"
                )} />
            )}
            {/* Glow effect for pinned orders */}
            {isPinned && (
                <div className="absolute -inset-0.5 bg-blue-400 rounded-[22px] blur-md opacity-40 group-hover:opacity-60 transition-opacity" />
            )}
            {/* Subtle glow effect for reviewed delivered orders */}
            {isReviewed && isDelivered && !isPinned && (
                <div className="absolute -inset-0.5 bg-cyan-400 rounded-[22px] blur-md opacity-25 group-hover:opacity-40 transition-opacity" />
            )}

            <motion.div
                layoutId={`order-card-inner-${order.id}-${order.status}`}
                className={cn(
                    "relative bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-all",
                    // Mobile: vertical layout, Desktop: horizontal
                    "flex flex-col md:flex-row",
                    actionsOpen ? "overflow-visible z-50" : "overflow-hidden",
                    // Priority order: blacklisted > return > urgent > duplicates > new > refunded
                    isBlacklisted && "ring-2 ring-red-500 ring-offset-2 ring-offset-[var(--background)]",
                    !isBlacklisted && isReturn && "ring-2 ring-red-400 ring-offset-2 ring-offset-[var(--background)]",
                    !isBlacklisted && !isReturn && isUrgent && "ring-2 ring-red-400 ring-offset-2 ring-offset-[var(--background)]",
                    !isBlacklisted && !isReturn && !isUrgent && hasDuplicates && isVerifiedCustomer && "ring-2 ring-emerald-300 ring-offset-2 ring-offset-[var(--background)]",
                    !isBlacklisted && !isReturn && !isUrgent && hasDuplicates && !isVerifiedCustomer && "ring-2 ring-orange-400 ring-offset-2 ring-offset-[var(--background)]",
                    !isBlacklisted && !isReturn && !isUrgent && !hasDuplicates && isNew && "ring-2 ring-orange-300 ring-offset-2 ring-offset-[var(--background)]",
                    // Refunded orders - dashed rose ring and slight opacity
                    !isBlacklisted && !isReturn && !isUrgent && !hasDuplicates && !isNew && hasRefund && "ring-2 ring-rose-300 ring-offset-2 ring-offset-[var(--background)] opacity-80"
                )}
            >
                {/* Status Accent Bar */}
                <motion.div
                    layoutId={`order-accent-${order.id}-${order.status}`}
                    className={cn(
                        "w-2 flex-shrink-0 rounded-l-[20px]",
                        getStatusColor(),
                        isNew && "w-3",
                        hasDuplicates && isVerifiedCustomer && "w-3 bg-emerald-400",
                        hasDuplicates && !isVerifiedCustomer && "w-4 bg-gradient-to-b from-orange-400 via-orange-500 to-orange-400 animate-pulse"
                    )}
                />

                {/* Selection Checkbox - Positioned top-left on mobile, inline on desktop */}
                {onToggleSelection && (
                    <>
                        {/* Desktop: inline checkbox */}
                        <div className="hidden md:flex pl-3 pr-1 items-center justify-center">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelection(order.id);
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                            />
                        </div>
                        {/* Mobile: absolute top-left checkbox - use left-1 to stay in accent area */}
                        <div className="md:hidden absolute top-2 left-1 z-10">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelection(order.id);
                                }}
                                className="w-5 h-5 rounded border-2 border-gray-300 bg-white text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer shadow-sm"
                            />
                        </div>
                    </>
                )}

                {/* Main Content Row */}
                <div
                    className={cn(
                        "flex-1 flex items-center gap-4 overflow-hidden cursor-pointer md:cursor-default",
                        compact ? "p-2" : "p-4"
                    )}
                    onClick={(e) => {
                        if (!onToggleSelection) {
                            e.stopPropagation();
                            onViewDetails(order);
                        }
                    }}
                >

                    {/* LEFT SECTION: Customer Info */}
                    <motion.div layoutId={`order-customer-${order.id}-${order.status}`} className={cn("space-y-1 flex-shrink-0", compact ? "min-w-[120px]" : "min-w-[160px]")}>
                        {/* Customer Name with sparkle for new */}
                        <motion.div
                            layoutId={`order-name-${order.id}-${order.status}`}
                            className="flex items-center gap-2 cursor-pointer hover:bg-black/5 rounded px-1 -ml-1 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                        >
                            {isPinned && <Pin className="w-4 h-4 text-blue-500 -rotate-45" />}
                            {isNew && !isPinned && <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />}
                            {isReturn && <RotateCcw className="w-4 h-4 text-red-600" />}
                            <span className="font-bold text-foreground text-base">
                                {order.customer_name}
                            </span>
                            {isBlacklisted && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-700" title="Blacklisted customer">
                                    <AlertTriangle className="w-3 h-3" />
                                </span>
                            )}
                        </motion.div>

                        {/* Order ID with Return indicator + Sequence Tag */}
                        <div className={cn("flex items-center gap-1.5 font-mono", isReturn ? "text-red-600" : "text-muted")}>
                            {isReturn && "↩ "}
                            {(() => {
                                // Extract base order ID from various formats:
                                // LF-5457-178 -> 5457
                                // CLN-LF-5457-178-ABC -> 5457
                                // RTN-123-1 -> 123
                                // 10033 -> 10033
                                let baseId = order.order_id;

                                // Try to extract base ID from LF-XXXX-XXX format
                                const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                                if (lfMatch) {
                                    baseId = lfMatch[1];
                                }
                                // Try to extract from CLN-LF-XXXX format
                                else if (order.order_id.startsWith('CLN-LF-')) {
                                    const clnMatch = order.order_id.match(/CLN-LF-(\d+)/);
                                    if (clnMatch) baseId = clnMatch[1];
                                }
                                // Try to extract from RTN-XXX-X format
                                else if (order.order_id.startsWith('RTN-')) {
                                    const rtnMatch = order.order_id.match(/RTN-(\d+)/);
                                    if (rtnMatch) baseId = rtnMatch[1];
                                }
                                // For other formats like SYYMMDD### or plain numbers, use as-is

                                return (
                                    <>
                                        <span
                                            className="px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm font-bold text-foreground cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                // Copy order ID to clipboard
                                                try {
                                                    await navigator.clipboard.writeText(order.order_id);
                                                    // Visual feedback would be nice here
                                                } catch (err) {
                                                    console.error('Failed to copy:', err);
                                                }
                                            }}
                                            title="انقر للنسخ"
                                        >
                                            #{baseId}
                                        </span>
                                        {order.sequence_number && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                                #{order.sequence_number}
                                            </span>
                                        )}
                                        {order.delivery_order_id && (
                                            <span
                                                className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-semibold flex items-center gap-1"
                                                title="رقم شركة التوصيل"
                                            >
                                                🚚 {order.delivery_order_id}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Date & Time with Age Badge - hidden in compact mode */}
                        {!compact && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-subtle">{formatShortDate(order.created_at)}</span>
                                <span className="text-[var(--card-border)]">|</span>
                                <span className="font-mono text-subtle">{formatTime(order.created_at)}</span>

                                {/* Order Age Badge with Color Coding */}
                                <span className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all",
                                    ageUrgency === "fresh" && "bg-green-100 text-green-700",
                                    ageUrgency === "normal" && "bg-gray-100 text-gray-600",
                                    ageUrgency === "attention" && "bg-yellow-100 text-yellow-700",
                                    ageUrgency === "urgent" && "bg-orange-100 text-orange-700 animate-pulse",
                                    ageUrgency === "stale" && "bg-red-100 text-red-700 animate-pulse",
                                    ageUrgency === "none" && "bg-gray-100 text-gray-500"
                                )}>
                                    <Clock className="w-3 h-3" />
                                    {orderAge}
                                </span>
                            </div>
                        )}

                        {/* Tags Row */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {/* Status Badge */}
                            <motion.span
                                layoutId={`order-status-${order.id}-${order.status}`}
                                className={cn(
                                    "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full uppercase tracking-wider",
                                    getStatusBadgeStyle(),
                                    isReturn && "bg-red-100 text-red-700"
                                )}
                            >
                                {isNew && <Sparkles className="w-3 h-3" />}
                                {isReturn && <RotateCcw className="w-3 h-3" />}
                                {isReturn ? "استرجاع" : getStatusLabel(order.status)}
                            </motion.span>


                            {/* Original Order Link for Returns */}
                            {isReturn && originalOrderInfo && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-gray-100 text-gray-600">
                                    ← من طلب #{(() => {
                                        // Extract base number from LF format or use sequence
                                        const orderId = originalOrderInfo.originalOrderId;
                                        const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
                                        return lfMatch ? lfMatch[1] : (originalOrderInfo.originalSequenceNumber || orderId);
                                    })()}
                                </span>
                            )}

                            {/* Priority Badge */}
                            {getPriorityBadge()}

                            {/* Source Badge */}
                            {getSourceBadge()}

                            {/* 7-Day Guarantee Countdown for Delivered Orders */}
                            {order.status === 'delivered' && order.delivered_at && (() => {
                                const daysLeft = getGuaranteeDaysRemaining(order.delivered_at);
                                if (daysLeft === null) return null;

                                if (daysLeft > 5) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-green-100 text-green-700">
                                            ✓ {daysLeft} أيام ضمان
                                        </span>
                                    );
                                } else if (daysLeft > 2) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-yellow-100 text-yellow-700">
                                            ⏱ {daysLeft} أيام ضمان
                                        </span>
                                    );
                                } else if (daysLeft > 0) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                            ⚠ {daysLeft === 1 ? 'آخر يوم!' : `${daysLeft} أيام`}
                                        </span>
                                    );
                                } else {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                                            انتهى الضمان
                                        </span>
                                    );
                                }
                            })()}

                            {/* Scheduled Date Indicator */}
                            {order.scheduled_date && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(order.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            )}

                            {/* Refund Indicator - Show when this order has a return order */}
                            {hasRefund && returnOrderInfo && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                    تم الاسترجاع #{returnOrderInfo.returnOrderId}
                                </span>
                            )}

                            {/* Returning Customer Indicator - Opens Comparison Modal */}
                            {customerOrderCount > 1 && (
                                <span
                                    className={cn(
                                        "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full cursor-pointer transition-colors",
                                        isVerifiedCustomer
                                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
                                            : "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200"
                                    )}
                                    title={previousOrder ? `طلب سابق: #${previousOrder.order_id}` : `${customerOrderCount} طلبات من هذا الزبون`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onShowDuplicates) {
                                            onShowDuplicates(order);
                                        } else if (previousOrder) {
                                            onViewDetails(previousOrder);
                                        }
                                    }}
                                >
                                    <Copy className="w-3 h-3" />
                                    {customerOrderCount} طلبات
                                </span>
                            )}
                        </div>
                    </motion.div>

                    {/* DIVIDER */}
                    <div className="w-px h-16 bg-[var(--card-border)] hidden md:block flex-shrink-0" />

                    {/* CENTER SECTION: Product, Phone, Address */}
                    <div className="flex-1 min-w-0 space-y-2 hidden md:block overflow-hidden">
                        {/* Product Row */}
                        <div className="flex items-center gap-3">
                            {/* Product Thumbnail */}
                            {items[0]?.image_url ? (
                                <img
                                    src={items[0].image_url}
                                    alt={items[0].name}
                                    className="w-12 h-12 rounded-xl object-cover border border-[var(--card-border)] flex-shrink-0"
                                />
                            ) : (
                                <div className={cn(
                                    "w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0",
                                    isNew
                                        ? "bg-orange-50 border-orange-200"
                                        : "bg-[var(--background)] border-[var(--card-border)]"
                                )}>
                                    <Package className={cn("w-5 h-5", isNew ? "text-orange-600" : "text-muted")} />
                                </div>
                            )}

                            {/* Product Names */}
                            <div className="flex-1 min-w-0">
                                {items.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {items.map((item, idx) => {
                                            // Only color quantity badge if > 1
                                            const quantityColor = item.quantity === 1
                                                ? 'bg-[var(--background)] text-muted border-[var(--card-border)]'
                                                : item.quantity === 2
                                                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                    : 'bg-rose-100 text-rose-700 border-rose-300';

                                            return (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium text-foreground bg-[var(--background)] border-l-[3px]"
                                                    style={{
                                                        borderLeftColor: item.tag_color || '#22c55e'
                                                    }}
                                                >
                                                    {item.name}
                                                    <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold border ${quantityColor}`}>
                                                        ×{item.quantity}
                                                    </span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span className="text-sm text-muted">No products</span>
                                )}
                            </div>
                        </div>

                        {/* Phone & Address Row - Desktop only */}
                        <div className="hidden md:flex items-center gap-4 text-sm overflow-hidden">
                            {/* Primary Phone */}
                            <div className="flex items-center gap-1.5 text-foreground">
                                {/* Validation indicator */}
                                {!validatePhoneDetailed(order.phone).isValid && (
                                    <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.phone).errorMessageAr}>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                    </span>
                                )}
                                <Phone className="w-3.5 h-3.5 text-muted" />
                                <span className={cn(
                                    "font-mono text-sm",
                                    !validatePhoneDetailed(order.phone).isValid && "text-red-600",
                                    hasDuplicates && !isVerifiedCustomer && "text-orange-600 font-semibold",
                                    hasDuplicates && isVerifiedCustomer && "text-emerald-600 font-semibold"
                                )}>
                                    {formatPhoneForDisplay(order.phone)}
                                </span>
                                {/* Duplicate/Returning customer icon next to phone */}
                                {hasDuplicates && (
                                    <ClipboardCopy className={cn(
                                        "w-3.5 h-3.5",
                                        isVerifiedCustomer ? "text-emerald-500" : "text-orange-500"
                                    )} />
                                )}
                            </div>

                            {/* Secondary Phone */}
                            {order.secondary_phone && (
                                <>
                                    <span className="text-[var(--card-border)]">|</span>
                                    <div className="flex items-center gap-1.5 text-foreground">
                                        {/* Validation indicator */}
                                        {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                            <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.secondary_phone).errorMessageAr}>
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                            </span>
                                        )}
                                        <Phone className="w-3.5 h-3.5 text-muted" />
                                        <span className={cn(
                                            "font-mono text-sm",
                                            !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600"
                                        )}>
                                            {formatPhoneForDisplay(order.secondary_phone)}
                                        </span>
                                    </div>
                                </>
                            )}

                            {/* Divider */}
                            {fullAddress && (
                                <>
                                    <span className="text-[var(--card-border)]">|</span>
                                    {/* Address */}
                                    <div className="flex items-center gap-1.5 text-muted flex-1 min-w-0">
                                        {/* Only show warning if address_details is empty */}
                                        {(!order.address_details || order.address_details.trim() === '') && (
                                            <span
                                                className="relative flex h-2.5 w-2.5 flex-shrink-0"
                                                title="لا يوجد تفاصيل عنوان"
                                            >
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                                            </span>
                                        )}
                                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="truncate text-right" dir="rtl" title={fullAddress}>{fullAddress}</span>
                                        {/* Show validated governorate code - check both columns */}
                                        {(order.validated_governorate_code || order.governorate_code) && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-semibold flex-shrink-0">
                                                {order.validated_governorate_code || order.governorate_code}
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Notes Row - Order Notes (amber) and Internal Notes (blue) */}
                        <div className="flex flex-wrap gap-2">
                            {actualNotes && (
                                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-amber-200">
                                    <FileText className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate" title={actualNotes}>{actualNotes}</span>
                                </div>
                            )}
                            {order.internal_notes && (
                                <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-blue-200">
                                    <FileText className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate" title={order.internal_notes}>{order.internal_notes}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PRICE SECTION - Hidden on mobile (shown at bottom instead) */}
                    <motion.div layoutId={`order-price-${order.id}-${order.status}`} className="hidden md:block text-right min-w-[100px] flex-shrink-0">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                            TOTAL
                        </p>
                        {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                            <>
                                <p className="text-lg font-bold text-emerald-600">
                                    واصل
                                </p>
                                <p className="text-xs text-muted font-mono">
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </p>
                            </>
                        ) : (
                            <p className={cn(
                                "text-lg font-bold tracking-tight",
                                isReturn ? "text-red-600" : "text-foreground",
                                hasRefund && "line-through opacity-50"
                            )}>
                                {isReturn && "-"}
                                {formatIQD(Math.abs(Number(order.price)))}
                            </p>
                        )}
                    </motion.div>

                    {/* MOBILE SECTION: Phone, Address & Price - shows below main content on mobile */}
                    <div className="md:hidden px-4 pb-4 space-y-2 -mt-2">
                        {/* Phone numbers row */}
                        <div className="flex items-center gap-3 text-sm flex-wrap">
                            {/* Primary Phone - clickable for WhatsApp */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!validatePhoneDetailed(order.phone).isValid) return;
                                    const link = generateWhatsAppLink(order.phone, `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`);
                                    window.open(link, "_blank");
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors",
                                    validatePhoneDetailed(order.phone).isValid
                                        ? "bg-[var(--pastel-green)] text-green-800 active:scale-95"
                                        : "bg-red-50 text-red-600"
                                )}
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span className="font-mono text-sm font-medium">
                                    {formatPhoneForDisplay(order.phone)}
                                </span>
                            </button>

                            {/* Secondary Phone */}
                            {order.secondary_phone && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!validatePhoneDetailed(order.secondary_phone!).isValid) return;
                                        const link = generateWhatsAppLink(order.secondary_phone!, `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`);
                                        window.open(link, "_blank");
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors",
                                        validatePhoneDetailed(order.secondary_phone).isValid
                                            ? "bg-gray-100 text-gray-700 active:scale-95"
                                            : "bg-red-50 text-red-600"
                                    )}
                                >
                                    <Phone className="w-4 h-4" />
                                    <span className="font-mono text-sm">
                                        {formatPhoneForDisplay(order.secondary_phone)}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Address row */}
                        {fullAddress && (
                            <div className="flex items-center gap-1.5 text-sm text-muted">
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate" dir="rtl">{fullAddress}</span>
                                {(order.validated_governorate_code || order.governorate_code) && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold flex-shrink-0">
                                        {order.validated_governorate_code || order.governorate_code}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Price at bottom right */}
                        <div className="flex items-center justify-end pt-2 border-t border-[var(--card-border)]">
                            {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                                <div className="text-right">
                                    <span className="text-base font-bold text-emerald-600">واصل</span>
                                    <span className="text-xs text-muted font-mono ml-2">
                                        {formatIQD(Math.abs(Number(order.price)))}
                                    </span>
                                </div>
                            ) : (
                                <span className={cn(
                                    "text-lg font-bold",
                                    isReturn ? "text-red-600" : "text-foreground",
                                    hasRefund && "line-through opacity-50"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* REVIEW INDICATOR - Only for delivered orders */}
                    {isDelivered && onToggleReviewed && (
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleReviewed(order.id);
                                }}
                                className={cn(
                                    "w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center",
                                    isReviewed
                                        ? "bg-cyan-500 border-cyan-600 shadow-lg shadow-cyan-500/50"
                                        : "bg-white border-gray-300 hover:border-cyan-400 hover:shadow-sm"
                                )}
                                title={isReviewed ? "تم المراجعة - انقر لإلغاء" : "انقر للتأشير كمراجَع"}
                            >
                                {isReviewed && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}

                    {/* DIVIDER - Desktop only */}
                    <div className="w-px h-16 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                    {/* ACTION BUTTONS - Desktop only */}
                    <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                        {/* Chat Button - Primary with Contact Stage Indicator */}
                        {(() => {
                            const contactCount = order.contact_count || 0;
                            const isValidPhone = validatePhoneDetailed(order.phone).isValid;

                            // Dynamic styling based on contact count
                            const getButtonStyle = () => {
                                if (!isValidPhone) return "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none";
                                switch (contactCount) {
                                    case 0: return "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] shadow-green-500/20"; // Green - New
                                    case 1: return "bg-yellow-500 text-white hover:bg-yellow-600 shadow-yellow-500/20"; // Yellow - Contacted once
                                    case 2: return "bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20"; // Orange - Contacted twice
                                    default: return "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20"; // Red - Multiple contacts
                                }
                            };

                            const getBadgeStyle = () => {
                                switch (contactCount) {
                                    case 0: return "bg-white text-green-600 border-green-200";
                                    case 1: return "bg-white text-yellow-600 border-yellow-200";
                                    case 2: return "bg-white text-orange-600 border-orange-200";
                                    default: return "bg-white text-red-600 border-red-200";
                                }
                            };

                            const getTitle = () => {
                                if (!isValidPhone) return validatePhoneDetailed(order.phone).errorMessageAr;
                                switch (contactCount) {
                                    case 0: return "WhatsApp - لم يتم التواصل بعد";
                                    case 1: return "WhatsApp - تم التواصل مرة واحدة";
                                    case 2: return "WhatsApp - تم التواصل مرتين";
                                    default: return `WhatsApp - تم التواصل ${contactCount} مرات`;
                                }
                            };

                            return (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
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
                                    }}
                                    disabled={!isValidPhone}
                                    className={cn(
                                        "w-10 h-10 rounded-xl transition-all shadow-md flex items-center justify-center relative",
                                        getButtonStyle()
                                    )}
                                    title={getTitle()}
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    <span className={cn(
                                        "absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm border",
                                        getBadgeStyle()
                                    )}>
                                        {contactCount > 0 ? (contactCount > 9 ? "9+" : contactCount) : ""}
                                    </span>
                                </button>
                            );
                        })()}

                        {/* Chat Button - Secondary Phone */}
                        {order.secondary_phone && validatePhoneDetailed(order.secondary_phone).isValid && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const link = generateWhatsAppLink(
                                        order.secondary_phone!,
                                        `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                    );
                                    window.open(link, "_blank");
                                }}
                                className="w-10 h-10 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center relative"
                                title="Chat on WhatsApp (Secondary)"
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full text-[10px] font-bold text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-200">2</span>
                            </button>
                        )}

                        {/* Edit Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                            className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center"
                            title="Edit Order"
                        >
                            <Edit className="w-4 h-4" />
                        </button>

                        {/* More Actions Dropdown */}
                        <div ref={actionsRef} className={cn("relative", actionsOpen && "z-50")}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (actionsOpen) {
                                        setActionsOpen(false);
                                        return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPosition({
                                        top: rect.bottom + 8,
                                        right: window.innerWidth - rect.right
                                    });
                                    setActionsOpen(true);
                                }}
                                className={cn(
                                    "w-10 h-10 rounded-xl border transition-all flex items-center justify-center",
                                    actionsOpen
                                        ? "bg-gray-100 border-gray-300 text-gray-700"
                                        : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:bg-[var(--card-border)]"
                                )}
                                title="More Actions"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu - Portal to body to avoid clipping */}
                            {actionsOpen && menuPosition && typeof document !== 'undefined' && createPortal(
                                <div
                                    ref={menuRef}
                                    style={{
                                        position: 'fixed',
                                        top: menuPosition.top,
                                        right: menuPosition.right,
                                        zIndex: 9999
                                    }}
                                    className="bg-[var(--card-bg)] rounded-2xl shadow-lg border border-[var(--card-border)] py-2 min-w-[140px]"
                                >
                                    {/* Copy */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await copyOrderToClipboard(order);
                                            setActionsOpen(false);
                                        }}
                                        className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-[var(--pastel-green-dark)]/30 transition-colors"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                                            <Copy className="w-3.5 h-3.5 text-green-700" />
                                        </div>
                                        <span className="font-medium">Copy</span>
                                    </button>

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Pin */}
                                    {onTogglePin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onTogglePin(order.id);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-[var(--pastel-blue)]/30 transition-colors"
                                        >
                                            <div className={cn(
                                                "w-7 h-7 rounded-lg flex items-center justify-center",
                                                isPinned ? "bg-blue-100" : "bg-[var(--pastel-blue)]"
                                            )}>
                                                <Pin className={cn("w-3.5 h-3.5", isPinned ? "text-blue-600 -rotate-45" : "text-blue-700")} />
                                            </div>
                                            <span className="font-medium">{isPinned ? "Unpin" : "Pin"}</span>
                                        </button>
                                    )}

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Clone */}
                                    {onCloneOrder && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCloneOrder(order.id);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-purple-100/50 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                                                <CopyPlus className="w-3.5 h-3.5 text-purple-600" />
                                            </div>
                                            <span className="font-medium">Clone</span>
                                        </button>
                                    )}

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Screenshot */}
                                    {onScreenshot && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onScreenshot(order);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-violet-100/50 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                                                <Camera className="w-3.5 h-3.5 text-violet-600" />
                                            </div>
                                            <span className="font-medium">Share</span>
                                        </button>
                                    )}
                                </div>,

                                document.body
                            )}
                        </div>

                        {/* Quick Status Actions */}
                        {order.status !== "completed" && order.status !== "rejected" && order.status !== "cancelled" && order.status !== "no_response" && (
                            <>
                                {/* Contacted - Pastel Yellow */}
                                {order.status === "new" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "contacted");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] text-amber-800 hover:bg-[var(--pastel-yellow-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Contacted"
                                    >
                                        <PhoneCall className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Confirmed - Pastel Green */}
                                {(order.status === "new" || order.status === "contacted") && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "confirmed");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] text-green-800 hover:bg-[var(--pastel-green-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Confirmed"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* In Transit - Blue (order shipped) - only for confirmed orders */}
                                {order.status === "confirmed" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "in_transit");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200 transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as In Transit"
                                    >
                                        <Truck className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Delivered - Pastel Mint (only for in_transit orders) */}
                                {order.status === "in_transit" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "delivered");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-mint)] text-teal-800 hover:bg-[var(--pastel-mint-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Delivered"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Rejected - Pastel Pink (customer rejected after delivery attempt - only for in_transit) */}
                                {order.status === "in_transit" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onRejectWithReason) {
                                                onRejectWithReason(order);
                                            } else {
                                                onStatusUpdate(order.id, "rejected");
                                            }
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-pink)] text-rose-800 hover:bg-[var(--pastel-pink-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Rejected"
                                    >
                                        <XCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Mark as Complete - Glowing green (only for delivered orders) */}
                                {order.status === "delivered" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "completed");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-2 ring-emerald-300/50 transition-all flex items-center justify-center disabled:opacity-50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                        title="طلب تام - Mark as Complete"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Cancel Button - For new, contacted, and confirmed orders */}
                                {(order.status === "new" || order.status === "contacted" || order.status === "confirmed") && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onCancelWithReason) {
                                                onCancelWithReason(order);
                                            } else {
                                                onStatusUpdate(order.id, "cancelled");
                                            }
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-pink-light)] border border-[var(--pastel-pink)] text-rose-700 hover:bg-[var(--pastel-pink)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Cancel Order"
                                    >
                                        <Ban className="w-4 h-4" />
                                    </button>
                                )}

                                {/* No Response Button - For contacted orders (alternative to cancel) */}
                                {order.status === "contacted" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "no_response");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center disabled:opacity-50"
                                        title="لم يرد - No Response"
                                    >
                                        <PhoneCall className="w-4 h-4" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>


            </motion.div>
        </motion.div >
    );
}
