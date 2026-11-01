"use client";

import { OrderPlacementBadge } from "@/components/orders/order-placement-badge";
import { AbandonedCartBadge } from "@/components/orders/abandoned-cart-badge";
import { AbandonedCartAccent } from "@/components/orders/abandoned-cart-accent";

import { HighlightedText } from "@scheniders/ui/highlighted-text";

import { formatIQD, cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { formatShortDate, formatTime, getStatusColor, getStatusBadgeStyle } from "@/lib/order-format-utils";

import { MessageCircle, Edit, Ban, MapPin, Sparkles, Calendar, Flag, Flame, Pin } from "lucide-react";
import { CardStatusMenu } from "./status-menu";
import { OrderIdChip } from "./order-id-chip";

import { useOrderCardModel, type OrderCardProps } from "./use-order-card-model";

/** Compact level 1 in grid mode: a stacked card with more detail. */
export function SemiCompactGridCard(props: OrderCardProps) {
    const { blacklistEntry, editable, governorateCode, isBlacklisted, isHighPriority, isNew, isPinned, isReturn, isUrgent, items, localSearchQuery, messageTemplates, onCancelWithReason, onOpenTemplatePanel, onRejectWithReason, onStatusUpdate, onViewDetails, openWhatsApp, order, orderStatusLabel, scheduledBadgeClass, scheduledLabel, scheduledState, t } = useOrderCardModel(props);
    const isValidPhone = validatePhoneDetailed(order.phone).isValid;
    const itemsText = items.length > 0
        ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
        : t("orders.card.noProducts");
    const cityDisplay = order.city || '';

    return (
        <div className="group relative w-full h-full">
            <div
                className={cn(
                    "relative bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-full",
                    "flex flex-col",
                    "border border-[var(--card-border)]/50 overflow-hidden",
                    "hover:border-[var(--secondary)] transition-colors duration-300",
                    isBlacklisted && "ring-1 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-1 ring-red-300",
                    order.is_archived && "opacity-65 grayscale-[0.4] bg-gray-50/10",
                )}
            >
                {/* Status bar top */}
                <div className={cn("relative overflow-hidden h-1.5 w-full flex-shrink-0", isBlacklisted ? "bg-gray-900" : getStatusColor(order.status, isReturn))}>
                    {!isBlacklisted && <AbandonedCartAccent order={order} orientation="horizontal" />}
                </div>

                {/* Blacklist banner */}
                {isBlacklisted && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold">
                        <Ban className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{t("orders.card.blockedCustomer")}</span>
                        {blacklistEntry?.reason && (
                            <span className="font-normal opacity-70 truncate">· {blacklistEntry.reason}</span>
                        )}
                    </div>
                )}

                <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
                    {/* Row 1: Name + Status */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            {isPinned && <Pin className="w-3 h-3 text-blue-500 -rotate-45 flex-shrink-0" />}
                            {isNew && !isPinned && <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                            <span className={cn(
                                "font-semibold text-sm truncate",
                                isReturn ? "text-rose-700" : "text-foreground"
                            )}>
                                {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                            </span>
                        </div>
                        <CardStatusMenu order={order} onStatusUpdate={onStatusUpdate} onCancelWithReason={onCancelWithReason} onRejectWithReason={onRejectWithReason}>
                            <span className={cn(
                                "inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider flex-shrink-0",
                                getStatusBadgeStyle(order.status),
                                isReturn && "bg-rose-100 text-rose-700"
                            )}>
                                {orderStatusLabel(order.status, isReturn)}
                            </span>
                        </CardStatusMenu>
                    </div>

                    {/* Row 2: Order ID + Date */}
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-muted flex items-center gap-1">
                            <OrderIdChip orderId={order.order_id} query={localSearchQuery} />
                        </span>
                        <OrderPlacementBadge order={order} />
                        <AbandonedCartBadge order={order} />
                        <span className="text-[var(--card-border)]">·</span>
                        <span className="text-muted">{formatShortDate(order.created_at)}</span>
                        <span className="text-muted">{formatTime(order.created_at)}</span>
                        {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                            <span className="relative group/date-tag">
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {t("orderDetail.dateCorrected")}
                                </span>
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 group-hover/date-tag:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                    {t("orders.ui.originalDate", { date: `${formatShortDate(order.original_created_at)} ${formatTime(order.original_created_at)}` })}
                                </span>
                            </span>
                        )}
                        {scheduledState && (
                            <span
                                className={cn("inline-flex items-center gap-0.5 px-1 py-0.5 text-[11px] font-bold rounded", scheduledBadgeClass)}
                                title={t("orderDetail.scheduledFor")}
                            >
                                <Calendar className="w-2.5 h-2.5" />
                                {scheduledLabel}
                            </span>
                        )}
                        {isUrgent && <Flame className="w-3 h-3 text-red-500 animate-pulse ml-auto" />}
                        {isHighPriority && !isUrgent && <Flag className="w-3 h-3 text-amber-600 ml-auto" />}
                    </div>

                    {/* Row 3: Items */}
                    <p className="text-xs text-foreground/70 truncate" title={itemsText}>
                        {itemsText}
                    </p>

                    {/* Row 4: City + Price */}
                    <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                        {cityDisplay ? (
                            <div className="flex items-center gap-1 text-xs text-muted min-w-0">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{editable("city", cityDisplay, <HighlightedText text={cityDisplay} query={localSearchQuery} />)}</span>
                                {governorateCode && (
                                    <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold flex-shrink-0">
                                        {governorateCode}
                                    </span>
                                )}
                            </div>
                        ) : <div />}

                        {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                            <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{t("orders.card.paid")}</span>
                        ) : (
                            <span className={cn(
                                "text-sm font-bold tabular-nums flex-shrink-0",
                                isReturn ? "text-red-600" : "text-foreground"
                            )}>
                                {isReturn && "-"}
                                {formatIQD(Math.abs(Number(order.price)))}
                            </span>
                        )}
                    </div>

                    {/* Row 5: Action Buttons */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--card-border)]/30">
                        {/* WhatsApp */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isValidPhone) return;

                                if (onOpenTemplatePanel && messageTemplates?.length > 0) {
                                    onOpenTemplatePanel(order);
                                } else {
                                    openWhatsApp(order.phone);
                                }
                            }}
                            disabled={!isValidPhone}
                            aria-label={t("orders.ctx.openWhatsapp")}
                            className={cn(
                                "flex-1 h-7 rounded-lg transition-all flex items-center justify-center gap-1 text-xs font-medium",
                                isValidPhone
                                    ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)]"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <MessageCircle className="w-3 h-3" />
                        </button>

                        {/* View Details */}
                        <button
                            type="button"
                            aria-label={t("orders.wf.details")}
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                            className="flex-1 h-7 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center gap-1 text-xs font-medium"
                        >
                            <Edit className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
