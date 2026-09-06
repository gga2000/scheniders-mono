"use client";

import React, { memo } from "react";
import { Order } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { formatShortDate, formatTime, getOrderAge, getItemsDisplay, getStatusBadgeStyle, getDisplayOrderId, getGovernorateCode, getFullAddress, getDropdownItemStyle, getStatusColor } from "@/lib/order-format-utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { generateWhatsAppLink } from "@/lib/utils";
import { MapPin, MessageCircle, Phone, Sparkles, PhoneCall, CheckCircle, Truck, Ban, XCircle, RotateCcw, Clock, AlertTriangle, Copy, ShieldAlert, Package, Bell, Gift } from "lucide-react";
import { REMINDER_DELAY_HOURS, DISCOUNT_DELAY_HOURS } from "@/lib/qstash";
import { cn, getStatusLabel } from "@/lib/utils";
import { RiskBadge } from "@/components/orders/risk-badge";
import { DiscountBadge } from "@/components/orders/discount-badge";
import { GeminiBadge } from "@/components/orders/gemini-badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@scheniders/ui/dropdown-menu";

interface MobileOrderCardProps {
    order: Order;
    onViewDetails: (order: Order) => void;
    onStatusUpdate: (id: string, status: Order["status"]) => void;
    // Let the parent handle swipe actions if needed
    onSwipeRight?: (order: Order) => void;
    onSwipeLeft?: (order: Order) => void;
    // Optional metrics
    riskLevel?: string;
    riskAssessment?: unknown;
    customerOrderCount?: number;
    hasDuplicates?: boolean;
    archivedOrderCount?: number;
    onOpenTemplatePanel?: (order: Order) => void;
}

export const MobileOrderCard = memo(function MobileOrderCard({
    order,
    onViewDetails,
    onStatusUpdate,
    riskLevel,
    riskAssessment,
    customerOrderCount = 1,
    hasDuplicates = false,
    archivedOrderCount = 0,
    onOpenTemplatePanel,
}: MobileOrderCardProps) {
    const isReturn = order.is_return;
    const items = getItemsDisplay(order.items || []);
    const itemsText = items.length > 0
        ? items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")
        : "No products";

    const isValidPhone = validatePhoneDetailed(order.phone).isValid;
    const phone2 = order.secondary_phone;
    const isValidPhone2 = phone2 ? validatePhoneDetailed(phone2).isValid : false;
    const governorateCode = getGovernorateCode(order);
    const fullAddress = getFullAddress(order.city, order.address_details);
    const orderAge = getOrderAge(order.created_at);

    // If not explicitly passed, try to extract from order object if available
    const resolvedRiskLevel = riskLevel || order.risk_data?.level;
    const totalOrders = customerOrderCount + archivedOrderCount;
    const hasManyOrders = totalOrders > 1 || hasDuplicates;

    // Time-based follow-up cue logic
    const contactCount = order.contact_count || 0;
    /* eslint-disable react-hooks/purity */
    const hoursSinceCreated = order.created_at
        ? (Date.now() - new Date(order.created_at).getTime()) / 3600000
        : 0;
    /* eslint-enable react-hooks/purity */

    // Determine which follow-up cue to show
    const isContacted = order.status === "contacted";
    const needsDiscount = isContacted && hoursSinceCreated >= DISCOUNT_DELAY_HOURS;
    const needsReminder = isContacted && !needsDiscount && hoursSinceCreated >= REMINDER_DELAY_HOURS;
    const needsFollowUp = needsReminder || needsDiscount;

    // Source badge
    const renderSourceBadge = () => {
        if (!order.source) return null;
        if (order.source === "whatsapp") {
            return (
                <span className="inline-flex h-5 items-center gap-1 px-1.5 text-[9px] font-semibold rounded-md bg-green-100 text-green-700">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="#25D366">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                </span>
            );
        } else if (order.source === "lightfunnels") {
            return (
                <span className="inline-flex h-5 items-center gap-1.5 px-1.5 text-[9px] font-semibold rounded-md bg-linear-to-r from-pink-50 via-purple-50 to-blue-50 text-purple-700 border border-purple-200">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                        <path d="M3 21L9 3L15 15L21 3" stroke="url(#lf-gradient-mobile)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <defs>
                            <linearGradient id="lf-gradient-mobile" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#EC4899" />
                                <stop offset="0.5" stopColor="#8B5CF6" />
                                <stop offset="1" stopColor="#3B82F6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    LightFunnels
                </span>
            );
        }
        return (
            <span className="inline-flex h-5 items-center gap-1.5 px-1.5 text-[9px] font-semibold rounded-md bg-gray-100 text-gray-600">
                {order.source}
            </span>
        );
    };

    const ORDER_STATUSES = [
        "new", "pending_checkout", "contacted", "confirmed", "in_transit", "delivered",
        "completed", "cancelled", "rejected", "no_response", "return_pending", "suspended"
    ] as const;

    const getStatusIcon = (status: Order["status"]) => {
        switch (status) {
            case "new": return <Sparkles className="w-3 h-3" />;
            case "contacted": return <PhoneCall className="w-3 h-3" />;
            case "confirmed": return <CheckCircle className="w-3 h-3" />;
            case "in_transit": return <Truck className="w-3 h-3" />;
            case "delivered": return <CheckCircle className="w-3 h-3" />;
            case "completed": return <CheckCircle className="w-3 h-3" />;
            case "cancelled": return <Ban className="w-3 h-3" />;
            case "rejected": return <XCircle className="w-3 h-3" />;
            case "no_response": return <PhoneCall className="w-3 h-3" />;
            case "return_pending": return <RotateCcw className="w-3 h-3" />;
            default: return null;
        }
    };

    return (
        <div
            className="bg-(--card-bg) border border-(--card-border)/60 rounded-2xl p-3 pr-3 pl-4 shadow-sm transition-all relative overflow-hidden flex flex-col gap-2"
        >
            {/* Status Side Color Accent — pulses amber/red when follow-up needed */}
            <div
                className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl shrink-0",
                    needsDiscount
                        ? "bg-red-500 animate-pulse"
                        : needsReminder
                            ? "bg-amber-500 animate-pulse"
                            : getStatusColor(order.status, isReturn)
                )}
            />

            {/* Main Content Split */}
            <div className="flex items-start justify-between gap-2">

                {/* Visual Right (DOM first): Customer Info, Address, Phone & Tags */}
                <div
                    className="flex flex-col min-w-0 flex-1 gap-1.5 cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                >
                    {/* Name, Order ID, Source Badge */}
                    <div className="flex items-center gap-1.5 mt-0.5 w-full">
                        <span className="font-bold text-[17px] text-foreground active:opacity-70 transition-opacity truncate shrink min-w-0">
                            {order.customer_name}
                        </span>
                        <div className="flex items-center gap-1 font-mono shrink-0">
                            {order.order_id?.startsWith('CHK-') ? (
                                <>
                                    <span className="text-[11px] font-bold text-muted-foreground/90 tracking-wider px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 uppercase">
                                        CHK
                                    </span>
                                    <span className="text-[11px] font-bold text-muted-foreground/90 tracking-wider px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                        {getDisplayOrderId(order.order_id)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-[11px] font-bold text-muted-foreground/90 tracking-wider px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                    #{getDisplayOrderId(order.order_id)}
                                </span>
                            )}
                        </div>
                        <div className="shrink-0">
                            {renderSourceBadge()}
                        </div>
                    </div>

                    {/* Address & Phone */}
                    <div className="flex flex-col gap-1 mt-0.5">
                        {fullAddress && (
                            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 wrap-break-word">{fullAddress}</span>
                                {governorateCode && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] w-fit font-bold shrink-0 ml-1">
                                        {governorateCode}
                                    </span>
                                )}
                            </div>
                        )}

                        {order.phone && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span dir="ltr" className={cn(!isValidPhone && "line-through text-red-500/70")}>{formatPhoneForDisplay(order.phone)}</span>

                                {phone2 && (
                                    <>
                                        <span className="text-muted-foreground/30 mx-0.5">|</span>
                                        <Phone className="w-3 h-3 shrink-0" />
                                        <span dir="ltr" className={cn(!isValidPhone2 && "line-through text-red-500/70")}>{formatPhoneForDisplay(phone2)}</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Other Tags (Risk, Duplicate) placed neatly below address & phone to save space */}
                    {((resolvedRiskLevel && resolvedRiskLevel !== "low") || hasManyOrders) && (
                        <div className="flex flex-wrap gap-1.5 items-center mt-1">

                            {resolvedRiskLevel && resolvedRiskLevel !== "low" && (
                                <span className="inline-flex h-5 items-center gap-1 px-1.5 text-[9px] font-bold rounded-md bg-red-100/80 text-red-700 animate-pulse border border-red-200">
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                    {resolvedRiskLevel} risk
                                </span>
                            )}

                            {hasManyOrders && (
                                <span className="inline-flex h-5 items-center gap-1 px-1.5 text-[9px] font-bold rounded-md bg-orange-100 text-orange-700 border border-orange-200">
                                    <Copy className="w-2.5 h-2.5" />
                                    {totalOrders > 1 ? `${totalOrders} Orders` : 'Duplicate'}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Visual Left (DOM second): Status & Time Stack */}
                <div className="flex flex-col items-end shrink-0 gap-1.5 w-fit min-w-[110px]">

                    {/* Status & Date Row */}
                    <div className="flex items-center gap-2 justify-end w-full">
                        <span className="text-[10px] font-mono font-medium text-muted-foreground/70 whitespace-nowrap">
                            {formatShortDate(order.created_at)}
                        </span>

                        {/* Status Dropdown */}
                        <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div className={cn(
                                        "cursor-pointer hover:opacity-80 active:scale-95 transition-all outline-none inline-flex items-center justify-center w-full px-3 py-1.5 text-[11px] font-bold rounded-lg tracking-wider text-center",
                                        getStatusBadgeStyle(order.status),
                                        isReturn && "bg-rose-100 text-rose-700"
                                    )}>
                                        {getStatusLabel(order.status, order.is_return || false) || order.status.replace('_', ' ')}
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[180px] p-2 space-y-1 rounded-xl bg-(--card-bg) border-(--card-border) shadow-xl z-50">
                                    <div className="text-xs font-semibold text-muted px-2 py-1 mb-1">تغيير حالة الطلب</div>
                                    {ORDER_STATUSES.map((status) => (
                                        <DropdownMenuItem
                                            key={status}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStatusUpdate(order.id, status);
                                            }}
                                            className={cn(
                                                "flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-bold transition-colors outline-none",
                                                getDropdownItemStyle(status),
                                                order.status === status && "ring-2 ring-black/10 dark:ring-white/10"
                                            )}
                                        >
                                            {getStatusIcon(status)}
                                            {getStatusLabel(status, order.is_return || false) || status.replace('_', ' ')}
                                            {order.status === status && <CheckCircle className="w-3.5 h-3.5 ml-auto opacity-70" />}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Delivery Company Badge */}
                    {order.delivery_company === 'waseet' && (
                        <span className="inline-flex h-5 items-center gap-1 px-1.5 text-[9px] font-bold rounded-md bg-cyan-100 text-cyan-700 border border-cyan-200 self-end">
                            <Truck className="w-2.5 h-2.5" />
                            الوسيط
                        </span>
                    )}

                    {/* Time Stack (Time above Time Ago) */}
                    <div className="flex flex-col items-end gap-1 opacity-80 mt-1 pr-1">
                        <span className="text-[10px] font-mono font-bold text-muted-foreground mr-1">
                            {formatTime(order.created_at)}
                        </span>
                        <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-muted-foreground">
                            <span>{orderAge}</span>
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: WhatsApp, Items & Price */}
            <div className="flex flex-row-reverse items-end justify-between gap-3 mt-1 pt-2 border-t border-(--card-border)/40 w-full">

                {/* Right Side Group: WhatsApp then Items */}
                <div className="flex flex-row-reverse flex-1 min-w-0 items-end justify-start gap-4 text-right">

                    {/* Touch-optimized Actions (Far Right in RTL) */}
                    <div className="flex flex-row-reverse items-center gap-1.5 shrink-0">
                        {/* Follow-up cue badge */}
                        {needsFollowUp && (
                            <div className={cn(
                                "flex items-center gap-1 px-1.5 py-1 rounded-lg text-xs font-bold animate-pulse border shadow-sm",
                                needsDiscount
                                    ? "bg-red-50 text-red-700 border-red-300"
                                    : "bg-amber-50 text-amber-700 border-amber-300"
                            )}>
                                {needsDiscount ? <Gift className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                                {needsDiscount
                                    ? `مرت ${Math.floor(hoursSinceCreated)} ساعة (خصم)`
                                    : `مرت ${Math.floor(hoursSinceCreated)} ساعة (تذكير)`}
                            </div>
                        )}

                        {phone2 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isValidPhone2) return;
                                    if (onOpenTemplatePanel) {
                                        onOpenTemplatePanel(order);
                                    } else {
                                        try {
                                            const link = generateWhatsAppLink(
                                                phone2,
                                                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                            );
                                            window.open(link, "_blank");
                                        } catch (error) {
                                            console.error("WhatsApp error", error);
                                        }
                                    }
                                }}
                                disabled={!isValidPhone2}
                                className={cn(
                                    "relative w-8 h-8 rounded-lg flex items-center justify-center transition-all text-white",
                                    isValidPhone2
                                        ? "bg-[#1E1E1E] active:scale-95"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed",
                                    needsFollowUp && isValidPhone2 && "ring-2 ring-amber-400 ring-offset-1"
                                )}
                                aria-label="WhatsApp Secondary"
                            >
                                <MessageCircle className="w-4 h-4" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isValidPhone) return;
                                if (onOpenTemplatePanel) {
                                    onOpenTemplatePanel(order);
                                } else {
                                    try {
                                        const link = generateWhatsAppLink(
                                            order.phone,
                                            `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                        );
                                        window.open(link, "_blank");
                                    } catch (error) {
                                        console.error("WhatsApp error", error);
                                    }
                                }
                            }}
                            disabled={!isValidPhone}
                            className={cn(
                                "relative w-8 h-8 rounded-lg flex items-center justify-center transition-all text-white",
                                isValidPhone
                                    ? "bg-[#1E1E1E] active:scale-95"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed",
                                needsFollowUp && isValidPhone && "ring-2 ring-amber-400 ring-offset-1"
                            )}
                            aria-label="WhatsApp Primary"
                        >
                            <MessageCircle className="w-4 h-4" />
                            {/* Contact count badge */}
                            {contactCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-white text-[10px] font-bold text-gray-800 flex items-center justify-center shadow-sm border border-gray-200 leading-none">
                                    {contactCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Items Description (Left of WhatsApp in RTL) */}
                    <div className="flex flex-row-reverse flex-wrap justify-start gap-1.5 w-full pb-px text-right">
                        {order.items?.map((item, index) => (
                            <div
                                key={index}
                                className="flex flex-row-reverse items-center gap-1.5 px-2.5 py-1.5 bg-background rounded-lg text-[11px] font-medium border border-(--card-border)/60 shadow-sm"
                            >
                                <span className="text-foreground line-clamp-1">{item.name}</span>
                                {item.quantity > 1 && (
                                    <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded bg-blue-100 text-blue-700 text-[9px] font-bold leading-none shrink-0 ring-1 ring-blue-200">
                                        ×{item.quantity}
                                    </span>
                                )}
                                {item.is_ai_extracted && <GeminiBadge size="xs" />}
                                {(item as { is_open_box?: boolean }).is_open_box && (
                                    <span className="flex items-center justify-center h-4 px-1 rounded bg-amber-100 text-amber-700 text-[9px] font-bold leading-none shrink-0 ring-1 ring-amber-200">
                                        علبة مفتوحة
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Price Display (Far Left in RTL) */}
                <div className="flex flex-col items-end shrink-0 text-left">
                    <span className="text-[10px] text-muted-foreground mb-0.5">الإجمالي</span>
                    {order.payment_status === "paid" || order.payment_status === "prepaid" ? (
                        <span className="text-sm font-bold tabular-nums text-emerald-600">واصل</span>
                    ) : (
                        <div className="flex flex-col items-end">
                            {order.discount_amount ? (
                                <>
                                    <span className="text-[10px] text-muted-foreground line-through decoration-red-400 decoration-2 font-mono mb-0.5">
                                        {formatIQD(Math.abs(Number(order.price)) + order.discount_amount)}
                                    </span>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <DiscountBadge
                                            price={Number(order.price)}
                                            discountAmount={order.discount_amount}
                                            className="scale-90 origin-left text-[9px]! px-1.5! py-0.5!"
                                        />
                                        <span className={cn(
                                            "text-sm font-bold tabular-nums",
                                            isReturn ? "text-red-600" : "text-foreground"
                                        )}>
                                            {isReturn && "-"}
                                            {formatIQD(Math.abs(Number(order.price)))}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <span className={cn(
                                    "text-sm font-bold tabular-nums",
                                    isReturn ? "text-red-600" : "text-foreground"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

MobileOrderCard.displayName = "MobileOrderCard";
