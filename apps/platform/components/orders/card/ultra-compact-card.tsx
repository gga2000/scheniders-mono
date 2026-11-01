"use client";


import { HighlightedText } from "@scheniders/ui/highlighted-text";

import { formatIQD, cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { getStatusColor, getStatusBadgeStyle } from "@/lib/order-format-utils";

import { DuplicateAlertBanner } from "@/components/orders/duplicate-alert-banner";

import { MessageCircle, Edit, Ban, MapPin, Sparkles, Flag, Flame, Pin } from "lucide-react";
import { CardStatusMenu } from "./status-menu";
import { OrderIdChip } from "./order-id-chip";

import { useOrderCardModel, type OrderCardProps } from "./use-order-card-model";

/** Compact level 2 as a list: one dense row with only the essentials. */
export function UltraCompactCard(props: OrderCardProps) {
    const { duplicateAlert, editable, governorateCode, isBlacklisted, isHighPriority, isNew, isPinned, isReturn, isSelected, isUrgent, items, localSearchQuery, messageTemplates, onCancelWithReason, onOpenTemplatePanel, onRejectWithReason, onStatusUpdate, onToggleSelection, onViewDetails, openWhatsApp, order, orderStatusLabel, t } = useOrderCardModel(props);
    const isValidPhone = validatePhoneDetailed(order.phone).isValid;
    const itemsText = items.length > 0
        ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
        : t("orders.card.noProducts");
    const cityDisplay = order.city || '';

    return (
        <div
            className={cn(
                "group relative w-full isolate",
            )}
        >
            {/* Dark mode vivid neon glow casted on the left side of the card */}
            <div className={cn("hidden dark:block absolute top-[10%] bottom-[10%] -left-0.5 w-2 blur-sm opacity-50 -z-10 transition-opacity", getStatusColor(order.status, isReturn))} />
            <div
                className={cn(
                    "relative z-10 bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200",
                    "flex items-center",
                    "border border-[var(--card-border)]/50",
                    "hover:border-[var(--secondary)] transition-colors duration-300",
                    // Subtle left-border rings based on priority
                    isBlacklisted && "ring-1 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-1 ring-red-300",
                    order.is_archived && "opacity-70 grayscale-[0.3]",
                )}
            >
                {/* Thin Status Accent Bar */}
                <div
                    className={cn(
                        "w-1 self-stretch rounded-l-xl flex-shrink-0",
                        isBlacklisted ? "bg-gray-900" : getStatusColor(order.status, isReturn)
                    )}
                />

                {/* Selection Checkbox */}
                {onToggleSelection && (
                    <div className="pl-2 flex items-center justify-center flex-shrink-0">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(order.id);
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                        />
                    </div>
                )}

                {/* Main Content - Single Row */}
                <div
                    className="flex-1 flex items-center gap-3 py-2 px-3 min-w-0 cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                >
                    {/* Customer Name + Order ID */}
                    <div className="flex items-center gap-2 min-w-[130px] max-w-[220px] flex-shrink-0">
                        {isPinned && <Pin className="w-3 h-3 text-blue-500 -rotate-45 flex-shrink-0" />}
                        {isNew && !isPinned && <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                        <span className={cn(
                            "font-semibold text-sm truncate",
                            isReturn ? "text-rose-700" : "text-foreground"
                        )}>
                            {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                        </span>
                        {isBlacklisted && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-900 text-white text-[11px] font-bold flex-shrink-0">
                                <Ban className="w-2.5 h-2.5" />
                                {t("orders.card.blocked")}
                            </span>
                        )}
                        <span className="text-xs font-mono text-muted flex-shrink-0 flex items-center gap-1">
                            <OrderIdChip orderId={order.order_id} query={localSearchQuery} />
                        </span>
                    </div>

                    {/* Thin Divider */}
                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                    {/* Status + Priority */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <CardStatusMenu order={order} onStatusUpdate={onStatusUpdate} onCancelWithReason={onCancelWithReason} onRejectWithReason={onRejectWithReason}>
                            <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider",
                                getStatusBadgeStyle(order.status),
                                isReturn && "bg-rose-100 text-rose-700"
                            )}>
                                {orderStatusLabel(order.status, isReturn)}
                            </span>
                        </CardStatusMenu>
                        {isUrgent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                <Flame className="w-2.5 h-2.5" />
                            </span>
                        )}
                        {isHighPriority && !isUrgent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">
                                <Flag className="w-2.5 h-2.5" />
                            </span>
                        )}
                        {duplicateAlert && (
                            <DuplicateAlertBanner alert={duplicateAlert} order={order} compact />
                        )}
                    </div>

                    {/* Thin Divider */}
                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                    {/* Items as Text */}
                    <div className="flex-1 min-w-0 hidden md:block">
                        <span className="text-sm text-foreground/70 truncate block" title={itemsText}>
                            {itemsText}
                        </span>
                    </div>

                    {/* Thin Divider */}
                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden lg:block" />

                    {/* City */}
                    {cityDisplay && (
                        <div className="hidden lg:flex items-center gap-1 text-xs text-muted flex-shrink-0 max-w-[120px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{editable("city", cityDisplay, <HighlightedText text={cityDisplay} query={localSearchQuery} />)}</span>
                            {governorateCode && (
                                <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold flex-shrink-0">
                                    {governorateCode}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Price */}
                    <div className="flex-shrink-0 text-right min-w-[70px]">
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

                {/* Compact Action Buttons */}
                <div className="hidden md:flex items-center gap-1.5 pr-3 flex-shrink-0">
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
                        className={cn(
                            "w-8 h-8 rounded-lg transition-all flex items-center justify-center",
                            isValidPhone
                                ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)] shadow-sm"
                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        )}
                        title={t("orders.tip.whatsapp")}
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(order);
                        }}
                        className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center"
                        title={t("orders.tip.viewDetails")}
                    >
                        <Edit className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
