"use client";

import { OrderPlacementBadge } from "@/components/orders/order-placement-badge";
import { AbandonedCartBadge } from "@/components/orders/abandoned-cart-badge";
import { AbandonedCartAccent } from "@/components/orders/abandoned-cart-accent";

import { HighlightedText } from "@scheniders/ui/highlighted-text";

import { formatIQD, cn } from "@/lib/utils";
import { getStatusColor, getStatusBadgeStyle } from "@/lib/order-format-utils";

import { Flag, Flame } from "lucide-react";
import { CardStatusMenu } from "./status-menu";
import { OrderIdChip } from "./order-id-chip";

import { useOrderCardModel, type OrderCardProps } from "./use-order-card-model";

/** Compact level 2 in grid mode: a stacked mini-card. */
export function UltraCompactGridCard(props: OrderCardProps) {
    const { editable, governorateCode, isBlacklisted, isHighPriority, isReturn, isUrgent, items, localSearchQuery, onCancelWithReason, onRejectWithReason, onStatusUpdate, onViewDetails, order, orderStatusLabel, t } = useOrderCardModel(props);
    const itemsText = items.length > 0
        ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
        : t("orders.card.noProducts");

    return (
        <div className="group relative w-full h-full">
            <div
                className={cn(
                    "relative bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-full",
                    "flex flex-col",
                    "border border-[var(--card-border)]/50 overflow-hidden cursor-pointer",
                    "hover:border-[var(--secondary)] transition-colors duration-300",
                    isBlacklisted && "ring-1 ring-red-400",
                    order.is_archived && "opacity-60 grayscale-[0.5] contrast-[0.9]",
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails(order);
                }}
            >
                {/* Status bar top */}
                <div className={cn("relative overflow-hidden h-1 w-full flex-shrink-0", getStatusColor(order.status, isReturn))}>
                    <AbandonedCartAccent order={order} orientation="horizontal" />
                </div>

                <div className="p-2.5 flex flex-col gap-1.5 flex-1 min-w-0">
                    {/* Row 1: Name + Status */}
                    <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                            "font-semibold text-sm truncate",
                            isReturn ? "text-rose-700" : "text-foreground"
                        )}>
                            {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                        </span>
                        <CardStatusMenu order={order} onStatusUpdate={onStatusUpdate} onCancelWithReason={onCancelWithReason} onRejectWithReason={onRejectWithReason}>
                            <span className={cn(
                                "inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider flex-shrink-0",
                                getStatusBadgeStyle(order.status),
                                isReturn && "bg-rose-100 text-rose-700"
                            )}>
                                {orderStatusLabel(order.status, isReturn)}
                            </span>
                        </CardStatusMenu>
                    </div>

                    {/* Row 2: Order ID + Priority */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-muted flex items-center gap-1">
                            <OrderIdChip orderId={order.order_id} query={localSearchQuery} />
                        </span>
                        <OrderPlacementBadge order={order} />
                        <AbandonedCartBadge order={order} />
                        {isUrgent && <Flame className="w-3 h-3 text-red-500 animate-pulse" />}
                        {isHighPriority && !isUrgent && <Flag className="w-2.5 h-2.5 text-amber-600" />}
                        {governorateCode && (
                            <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold ml-auto">
                                {governorateCode}
                            </span>
                        )}
                    </div>

                    {/* Row 3: Items */}
                    <p className="text-xs text-foreground/60 truncate" title={itemsText}>
                        {itemsText}
                    </p>

                    {/* Row 4: Price */}
                    <div className="mt-auto pt-1">
                        {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                            <span className="text-sm font-bold text-emerald-600">{t("orders.card.paid")}</span>
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
                </div>
            </div>
        </div>
    );
}
