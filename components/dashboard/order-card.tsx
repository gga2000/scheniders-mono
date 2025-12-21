"use client";

import { Order, OrderPriority } from "@/lib/supabase";
import { formatIQD, generateWhatsAppLink, getStatusLabel } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { cn } from "@/lib/utils";
import {
    MessageCircle,
    Edit,
    XCircle,
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
}: OrderCardProps) {
    const isLoading = loadingId === order.id;
    const isNew = order.status === "new";
    const isReturn = order.is_return;
    const isUrgent = order.priority === "urgent";
    const isHighPriority = order.priority === "high";
    const hasDuplicates = customerOrderCount > 1;

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
        return items.slice(0, 2).map(item => ({
            name: item.name,
            quantity: item.quantity,
            image_url: item.image_url,
            tag_color: item.tag_color
        }));
    };

    // Get address from address_details or city
    const getFullAddress = () => {
        return order.address_details || order.city || '';
    };

    // Get notes directly (no longer contains address)
    const getActualNotes = () => {
        return order.notes?.trim() || '';
    };

    const fullAddress = getFullAddress();
    const actualNotes = getActualNotes();

    // Soft pastel status colors - reassigned (with return order override)
    const getStatusColor = () => {
        if (isReturn) return "bg-purple-400"; // Purple for return orders
        switch (order.status) {
            case "new": return "bg-orange-300"; // Warm coral for new
            case "contacted": return "bg-[var(--pastel-yellow)]"; // Yellow for contacted
            case "confirmed": return "bg-[var(--pastel-green)]"; // Green for confirmed
            case "delivered": return "bg-[var(--pastel-mint)]"; // Mint/Blue for delivered
            case "rejected": return "bg-[var(--pastel-pink)]"; // Pink/Red for rejected
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
            case "delivered": return "bg-[var(--pastel-mint)] text-teal-900";
            case "rejected": return "bg-[var(--pastel-pink)] text-rose-900";
            default: return "bg-gray-100 text-gray-700";
        }
    };

    const items = getItemsDisplay(order.items || []);

    return (
        <motion.div
            layoutId={`order-card-${order.id}`}
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
                <div className="absolute -inset-0.5 bg-purple-400 rounded-[22px] blur-md opacity-40 group-hover:opacity-60 transition-opacity" />
            )}
            {/* Glow effect for duplicate orders */}
            {hasDuplicates && !isReturn && !isUrgent && (
                <div className="absolute -inset-0.5 bg-orange-400 rounded-[22px] blur-md opacity-50 group-hover:opacity-70 transition-opacity animate-pulse" />
            )}

            <motion.div
                layoutId={`order-card-inner-${order.id}`}
                className={cn(
                    "relative bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden flex hover:shadow-[var(--card-shadow-hover)] transition-all",
                    isNew && "ring-2 ring-orange-300 ring-offset-2 ring-offset-[var(--background)]",
                    isReturn && "ring-2 ring-purple-400 ring-offset-2 ring-offset-[var(--background)]",
                    isUrgent && !isNew && "ring-2 ring-red-400 ring-offset-2 ring-offset-[var(--background)]",
                    isBlacklisted && "ring-2 ring-red-500 ring-offset-2 ring-offset-[var(--background)]",
                    hasDuplicates && "ring-2 ring-orange-400 ring-offset-2 ring-offset-[var(--background)]"
                )}
            >
                {/* Status Accent Bar */}
                <motion.div
                    layoutId={`order-accent-${order.id}`}
                    className={cn(
                        "w-2 flex-shrink-0 rounded-l-[20px]",
                        getStatusColor(),
                        isNew && "w-3",
                        hasDuplicates && "w-4 bg-gradient-to-b from-orange-400 via-orange-500 to-orange-400 animate-pulse"
                    )}
                />

                {/* Main Content */}
                <div className="flex-1 p-4 flex items-center gap-4">

                    {/* LEFT SECTION: Customer Info */}
                    <motion.div layoutId={`order-customer-${order.id}`} className="min-w-[160px] space-y-1">
                        {/* Customer Name with sparkle for new */}
                        <motion.div
                            layoutId={`order-name-${order.id}`}
                            className="flex items-center gap-2"
                        >
                            {isNew && <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />}
                            {isReturn && <RotateCcw className="w-4 h-4 text-purple-600" />}
                            <span className="font-bold text-foreground text-base">
                                {order.customer_name}
                            </span>
                            {isBlacklisted && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-700" title="Blacklisted customer">
                                    <AlertTriangle className="w-3 h-3" />
                                </span>
                            )}
                        </motion.div>

                        {/* Order ID with Return indicator */}
                        <p className={cn("text-xs font-mono", isReturn ? "text-purple-600" : "text-muted")}>
                            {isReturn && "↩ "}
                            #{order.order_id}
                        </p>

                        {/* Date & Time with Age Badge */}
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

                        {/* Tags Row */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {/* Status Badge */}
                            <motion.span
                                layoutId={`order-status-${order.id}`}
                                className={cn(
                                    "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full uppercase tracking-wider",
                                    getStatusBadgeStyle(),
                                    isReturn && "bg-purple-100 text-purple-700"
                                )}
                            >
                                {isNew && <Sparkles className="w-3 h-3" />}
                                {isReturn && <RotateCcw className="w-3 h-3" />}
                                {isReturn ? "Return" : getStatusLabel(order.status)}
                            </motion.span>

                            {/* Priority Badge */}
                            {getPriorityBadge()}

                            {/* Scheduled Date Indicator */}
                            {order.scheduled_date && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(order.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            )}

                            {/* Duplicate Order Indicator */}
                            {customerOrderCount > 1 && (
                                <span
                                    className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-orange-100 text-orange-700 border border-orange-200 cursor-pointer hover:bg-orange-200 transition-colors"
                                    title={previousOrder ? `طلب سابق: #${previousOrder.order_id}` : `${customerOrderCount} طلبات من هذا الزبون`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (previousOrder) {
                                            onViewDetails(previousOrder);
                                        }
                                    }}
                                >
                                    <Copy className="w-3 h-3" />
                                    {customerOrderCount} طلبات
                                </span>
                            )}

                            {/* Merge Button - show when there's a previous order to merge with */}
                            {previousOrder && onMergeWithPrevious && !order.is_archived && order.status !== "delivered" && previousOrder.status !== "delivered" && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Determine which is older (keep older, archive newer)
                                        const currentDate = new Date(order.created_at);
                                        const previousDate = new Date(previousOrder.created_at);
                                        if (currentDate > previousDate) {
                                            // Current is newer, merge into previous (older)
                                            onMergeWithPrevious(previousOrder.id, order.id);
                                        } else {
                                            // Current is older, merge into current
                                            onMergeWithPrevious(order.id, previousOrder.id);
                                        }
                                    }}
                                    className="inline-flex h-6 items-center gap-1 px-3 text-[10px] font-bold rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg"
                                    title="دمج مع الطلب السابق"
                                >
                                    <Link2 className="w-3 h-3" />
                                    دمج الطلبات
                                </button>
                            )}
                        </div>
                    </motion.div>

                    {/* DIVIDER */}
                    <div className="w-px h-16 bg-[var(--card-border)] hidden md:block" />

                    {/* CENTER SECTION: Product, Phone, Address */}
                    <div className="flex-1 min-w-0 space-y-2 hidden md:block">
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
                                        {(order.items?.length || 0) > 2 && (
                                            <span className="text-xs text-muted self-center">+{(order.items?.length || 0) - 2} more</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm text-muted">No products</span>
                                )}
                            </div>
                        </div>

                        {/* Phone & Address Row */}
                        <div className="flex items-center gap-4 text-sm">
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
                                    !validatePhoneDetailed(order.phone).isValid && "text-red-600"
                                )}>
                                    {formatPhoneForDisplay(order.phone)}
                                </span>
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
                                    <span className="text-[var(--card-border)]">•</span>
                                    {/* Full Address */}
                                    <div className="flex items-center gap-1.5 text-muted flex-1 min-w-0">
                                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="truncate">{fullAddress}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Notes Row */}
                        {actualNotes && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate" title={actualNotes}>{actualNotes}</span>
                            </div>
                        )}
                    </div>

                    {/* PRICE SECTION */}
                    <motion.div layoutId={`order-price-${order.id}`} className="text-right min-w-[100px]">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                            {isReturn ? "Refund" : "Total"}
                        </p>
                        <p className={cn(
                            "text-lg font-bold tracking-tight",
                            isReturn ? "text-purple-600" : "text-foreground"
                        )}>
                            {isReturn && Number(order.price) > 0 && "-"}
                            {formatIQD(Math.abs(Number(order.price)))}
                        </p>
                    </motion.div>

                    {/* DIVIDER */}
                    <div className="w-px h-16 bg-[var(--card-border)]" />

                    {/* ACTION BUTTONS */}
                    <div className="flex items-center gap-2">
                        {/* Chat Button - Primary */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!validatePhoneDetailed(order.phone).isValid) return;
                                const link = generateWhatsAppLink(
                                    order.phone,
                                    `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                );
                                window.open(link, "_blank");
                            }}
                            disabled={!validatePhoneDetailed(order.phone).isValid}
                            className={cn(
                                "w-10 h-10 rounded-xl transition-all shadow-md flex items-center justify-center",
                                validatePhoneDetailed(order.phone).isValid
                                    ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] shadow-green-500/20"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                            )}
                            title={validatePhoneDetailed(order.phone).isValid ? "Chat on WhatsApp" : validatePhoneDetailed(order.phone).errorMessageAr}
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>

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
                                className="w-10 h-10 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center"
                                title="Chat on WhatsApp (Secondary)"
                            >
                                <MessageCircle className="w-4 h-4" />
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

                        {/* Quick Status Actions */}
                        {order.status !== "delivered" && order.status !== "rejected" && (
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

                                {/* Delivered - Pastel Mint/Blue */}
                                {order.status === "confirmed" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "delivered");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-mint)] text-teal-800 hover:bg-[var(--pastel-mint-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Delivered"
                                    >
                                        <Truck className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Reject Button - Pastel Pink */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusUpdate(order.id, "rejected");
                                    }}
                                    disabled={isLoading}
                                    className="w-10 h-10 rounded-xl bg-[var(--pastel-pink-light)] border border-[var(--pastel-pink)] text-rose-700 hover:bg-[var(--pastel-pink)] transition-all flex items-center justify-center disabled:opacity-50"
                                    title="Reject Order"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
