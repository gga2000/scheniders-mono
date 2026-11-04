"use client";

import { AbandonedCartBadge } from "@/components/orders/abandoned-cart-badge";
import { RiskBadge } from "@/components/orders/risk-badge";
import { OrderShield } from "@/components/orders/shield/order-shield";
import { HighlightedText } from "@scheniders/ui/highlighted-text";
import { getGuaranteeDaysRemaining, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { formatShortDate, formatTime, getStatusBadgeStyle, getDisplayOrderId, isSystemActor } from "@/lib/order-format-utils";
import { XCircle, Truck, Sparkles, AlertTriangle, Calendar, RotateCcw, FileText, Pin, Clock, Copy, CopyPlus, PhoneOff, History as HistoryIcon, Archive as ArchiveIcon, Bot, Cog, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { PriorityBadge } from "./priority-badge";
import { SourceBadge } from "./source-badge";
import { StuckTransitBadge } from "./stuck-transit-badge";
import { PrimeChip } from "./prime-chip";
import { DeliverySlotChip } from "./delivery-slot-chip";
import { GiftChip } from "./gift-chip";
import { TakeChip } from "./take-chip";
import { PaymentCheckButton } from "./payment-check-button";
import { EnteredByMark } from "./entered-by-mark";
import { ClaudeChip } from "./claude-chip";
import { CardStatusMenu } from "./status-menu";
import { RefundOrderChip, RefundOfLink, OriginalRefundChip } from "../refund-chips";
import type { OrderCardModel } from "./use-order-card-model";

/** One section of the full order card; see FullOrderCard in ../order-card.tsx. */
export function FullCardCustomer({ m }: { m: OrderCardModel }) {
    const { ageUrgency, archivedOrderCount, compact, customerOrderCount, editable, getLayoutId, isBlacklisted, isNew, isPinned, isReturn, isVerifiedCustomer, linkedOriginalOrder, linkedRefundOrder, localSearchQuery, markImageFailed, onCancelWithReason, onRejectWithReason, onShowDuplicates, onStatusUpdate, onToggleReviewed, onViewDetails, order, orderAge, orderStatusLabel, originalOrderInfo, previousOrder, riskAssessment, riskLevel, scheduledBadgeClass, scheduledLabel, scheduledState, statusAvatarUrl, t } = m;
    return (
        <>
            {/* LEFT SECTION: Customer Info */}
            <motion.div layoutId={getLayoutId(`order-customer-${order.id}-${order.status}`)} className={cn("space-y-1 flex-shrink-0", compact === 1 ? "min-w-[140px]" : "min-w-[160px]")}>
                {/* Customer Name with sparkle for new */}
                <motion.div
                    layoutId={getLayoutId(`order-name-${order.id}-${order.status}`)}
                    className="flex items-center gap-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded px-1 -ml-1 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                >
                    {isPinned && <Pin className="w-4 h-4 text-blue-500 -rotate-45" />}
                    {isNew && !isPinned && <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />}

                    <AbandonedCartBadge order={order} />

                    {order.is_return && <RefundOrderChip />}

                    <span className={cn(
                        "font-bold tracking-tight",
                        compact === 1 ? "text-sm" : "text-base",
                        order.is_return ? "text-rose-700 dark:text-rose-400" : "text-foreground dark:text-white"
                    )}>
                        {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />, undefined, true)}
                    </span>

                    {!riskLevel && isBlacklisted && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold rounded bg-red-100 text-red-700" title={t("orders.tip.blacklisted")}>
                            <AlertTriangle className="w-3 h-3" />
                        </span>
                    )}

                    <OrderShield order={order} riskAssessment={riskAssessment} />
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
                                <div className="flex items-center gap-1.5">
                                    {order.order_id?.startsWith('CHK-') && (
                                        <span className="px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm font-bold text-foreground dark:bg-black/20 dark:border-[#333] dark:text-[#00E5FF]">
                                            CHK
                                        </span>
                                    )}
                                    <span
                                        className="px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm font-bold text-foreground cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:bg-black/20 dark:border-[#333] dark:text-[#00E5FF] dark:hover:bg-[#00E5FF]/10 dark:hover:text-[#00FFFF] dark:hover:border-[#00FFFF]/30 transition-colors"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            // Copy order ID to clipboard
                                            try {
                                                await navigator.clipboard.writeText(order.order_id);
                                            } catch {
                                                toast.error(t("orders.toast.copyFailed"));
                                            }
                                        }}
                                        title={t("orders.card.clickToCopy")}
                                    >
                                        {!order.order_id?.startsWith('CHK-') && "#"}
                                        <HighlightedText text={getDisplayOrderId(baseId)} query={localSearchQuery} />
                                    </span>
                                </div>

                                {/* Last Status Actor Avatar */}
                                {order.last_status_changed_by_name && (
                                    <div
                                        className="flex items-center -ml-0.5 transition-transform hover:scale-110"
                                        title={isSystemActor(order.last_status_changed_by_name)
                                            ? t("orders.card.systemActorTip")
                                            : `Last updated by: ${order.last_status_changed_by_name}`}
                                    >
                                        {isSystemActor(order.last_status_changed_by_name) ? (
                                            <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                <Cog className="w-3 h-3" />
                                            </div>
                                        ) : order.last_status_changed_by_avatar === 'bot' ? (
                                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm">
                                                <Bot className="w-3 h-3" />
                                            </div>
                                        ) : statusAvatarUrl ? (
                                            <img
                                                src={statusAvatarUrl}
                                                alt={order.last_status_changed_by_name}
                                                onError={() => markImageFailed(statusAvatarUrl)}
                                                className="w-5 h-5 rounded-full border border-[var(--card-border)] bg-[var(--background)] object-cover shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[11px] font-bold shadow-sm">
                                                {order.last_status_changed_by_name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {order.is_test && (
                                    <span className="bg-purple-600 text-white text-[11px] px-2 py-0.5 rounded-full font-bold uppercase shadow-lg ring-2 ring-purple-300 animate-pulse flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />
                                        TEST
                                    </span>
                                )}
                                {order.sequence_number && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                                        #{order.sequence_number}
                                    </span>
                                )}
                                {order.delivery_order_id && (
                                    <span
                                        className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[11px] font-semibold flex items-center gap-1"
                                        title={t("orders.card.courierNumber")}
                                    >
                                        🚚 {order.delivery_order_id}
                                    </span>
                                )}
                                {/* Original Order Reference in Header - REMOVED: consolidated into tags row */}
                                {(!order.is_return && previousOrder) && (
                                    <span
                                        className={cn(
                                            "px-1.5 py-0.5 rounded text-[11px] font-bold border cursor-pointer transition-all flex items-center gap-1",
                                            isVerifiedCustomer
                                                ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                                                : "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewDetails(previousOrder);
                                        }}
                                        title={t("orders.card.viewPrevious")}
                                    >
                                        <CopyPlus className="w-3 h-3" />
                                        {t("orders.card.previousOrder", { id: previousOrder.order_id })}
                                    </span>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Date & Time with Age Badge - visible in normal and semi-compact */}
                {(
                    <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-muted">{formatShortDate(order.created_at)}</span>
                        <span className="text-[var(--card-border)]">|</span>
                        <span className="font-mono text-muted">{formatTime(order.created_at)}</span>

                        {/* Date Modified Indicator */}
                        {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                            <span className="relative group/date-tag">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-md">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {t("orderDetail.dateCorrected")}
                                </span>
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 group-hover/date-tag:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                    {t("orders.ui.originalDate", { date: `${formatShortDate(order.original_created_at)} ${formatTime(order.original_created_at)}` })}
                                </span>
                            </span>
                        )}

                        {/* Order Age Badge with Color Coding */}
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition-all",
                            ageUrgency === "fresh" && "bg-green-100 text-green-700",
                            ageUrgency === "normal" && "bg-gray-100 text-gray-600",
                            ageUrgency === "attention" && "bg-yellow-100 text-yellow-700",
                            ageUrgency === "urgent" && "bg-orange-100 text-orange-700 animate-pulse",
                            ageUrgency === "stale" && "bg-red-100 text-red-700 animate-pulse",
                            ageUrgency === "scheduled" && "bg-slate-100 text-slate-600",
                            ageUrgency === "none" && "bg-gray-100 text-gray-500"
                        )}>
                            <Clock className="w-3 h-3" />
                            {orderAge}
                        </span>

                        {/* Parked for a later day — not overdue work */}
                        {scheduledState && (
                            <span
                                className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold", scheduledBadgeClass)}
                                title={t("orderDetail.scheduledFor")}
                            >
                                <Calendar className="w-3 h-3" />
                                {scheduledLabel}
                            </span>
                        )}

                        <DeliverySlotChip slot={order.delivery_slot} />
                        <GiftChip isGift={order.is_gift} />
                        <TakeChip kind={order.take_kind} />
                    </div>
                )}

                {/* Tags Row - hidden in semi-compact */}
                {compact === 0 && <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {/* Status Badge */}
                    <CardStatusMenu order={order} onStatusUpdate={onStatusUpdate} onCancelWithReason={onCancelWithReason} onRejectWithReason={onRejectWithReason}>
                        <motion.span
                            layoutId={getLayoutId(`order-status-${order.id}-${order.status}`)}
                            className={cn(
                                "inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full uppercase tracking-wider",
                                getStatusBadgeStyle(order.status),
                                isReturn && "bg-rose-100 text-rose-700 border border-rose-200"
                            )}
                        >
                            {isNew && <Sparkles className="w-3 h-3" />}
                            {isReturn && <RotateCcw className="w-3 h-3" />}
                            {orderStatusLabel(order.status, isReturn)}
                        </motion.span>
                    </CardStatusMenu>

                    <StuckTransitBadge order={order} />
                    <PrimeChip order={order} />
                    {onToggleReviewed && <PaymentCheckButton order={order} onToggle={onToggleReviewed} />}

                    {/* Delivery Company Badge */}
                    {order.delivery_company === 'waseet' && (
                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">
                            <Truck className="w-3 h-3 flex-shrink-0" />
                            {t("orders.card.waseet")}
                            {order.waseet_status_text && (
                                <span className="text-cyan-600">• {order.waseet_status_text}</span>
                            )}
                        </span>
                    )}

                    {/* Al-Waseet QR Link */}
                    {order.waseet_qr_link && (
                        <a
                            href={order.waseet_qr_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            {t("orders.card.waseetReceipt")}
                        </a>
                    )}

                    {/* Delivery Note - right after status badge for visibility */}
                    {order.delivery_note && (
                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-medium rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[220px]">{order.delivery_note}</span>
                        </span>
                    )}

                    {/* Detailed Risk Warning - Only show in full view */}
                    {compact === 0 && (riskLevel === 'high' || riskLevel === 'blocked' || riskLevel === 'medium') &&
                        ['new', 'contacted', 'confirmed', 'in_transit', 'return_pending'].includes(order.status) && (
                            <>
                                <RiskBadge level={riskLevel} assessment={riskAssessment} customerPhone={order.phone} showLabel={true} className="h-6" />

                                {/* Dynamic History Details: Rejected vs No Response */}
                                {((riskAssessment?.historicalData?.rejectedCustomerFaultCount ?? 0) > 0) && (
                                    <span className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold border border-rose-200">
                                        <XCircle className="w-3 h-3" />
                                        {t("orders.card.prevRejected")}
                                    </span>
                                )}
                                {/* Previous Refund - PURPLE */}
                                {(riskAssessment?.historicalData?.refundCount ?? 0) > 0 && (
                                    <span className="inline-flex h-6 items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                        <RotateCcw className="w-3 h-3" />
                                        {t("orders.card.prevRefunded", { count: riskAssessment?.historicalData?.refundCount ?? 0 })}
                                    </span>
                                )}

                                {/* No Response History - ORANGE */}
                                {((riskAssessment?.historicalData?.noResponseCount ?? 0) > 0) && (
                                    <span className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold border border-orange-200">
                                        <PhoneOff className="w-3 h-3" />
                                        {t("orders.card.prevNoResponse")}
                                    </span>
                                )}
                            </>
                        )}

                    {/* Archive Tag */}
                    {order.is_archived && (
                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                            <ArchiveIcon className="w-3 h-3" />
                            {t("orders.card.archived")}
                        </span>
                    )}

                    {/* Original Order Link for Returns - REMOVED: consolidated into single rose tag below */}

                    {/* Priority Badge */}
                    <PriorityBadge priority={order.priority} />

                    {/* Source Badge - hidden in semi-compact */}
                    {compact === 0 && <SourceBadge source={order.source} />}
                    {compact === 0 && <ClaudeChip createdVia={order.created_via} />}
                    {compact === 0 && <EnteredByMark enteredBy={order.entered_by} source={order.source} />}

                    {/* 7-Day Guarantee Countdown - hidden in semi-compact */}
                    {compact === 0 && order.status === 'delivered' && order.delivered_at && (() => {
                        const daysLeft = getGuaranteeDaysRemaining(order.delivered_at);
                        if (daysLeft === null) return null;

                        if (daysLeft > 5) {
                            return (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-green-100 text-green-700">
                                    ✓ {t("orders.card.guaranteeDays", { count: daysLeft })}
                                </span>
                            );
                        } else if (daysLeft > 2) {
                            return (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-yellow-100 text-yellow-700">
                                    ⏱ {t("orders.card.guaranteeDays", { count: daysLeft })}
                                </span>
                            );
                        } else if (daysLeft > 0) {
                            return (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                    ⚠ {daysLeft === 1 ? t("orders.card.lastDay") : t("orders.card.daysLeft", { count: daysLeft })}
                                </span>
                            );
                        } else {
                            return (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-medium rounded-full bg-gray-100 text-gray-500">
                                    {t("orders.card.guaranteeOver")}
                                </span>
                            );
                        }
                    })()}

                    {/* Refund state of an original order - hidden in semi-compact */}
                    {compact === 0 && !isReturn && (
                        <OriginalRefundChip
                            refundStatus={order.refund_status}
                            onOpen={linkedRefundOrder ? () => onViewDetails(linkedRefundOrder) : undefined}
                        />
                    )}

                    {/* Which order a refund order refunds - hidden in semi-compact */}
                    {compact === 0 && isReturn && originalOrderInfo && (
                        <RefundOfLink
                            original={{ order_id: originalOrderInfo.originalOrderId }}
                            onOpen={linkedOriginalOrder ? () => onViewDetails(linkedOriginalOrder) : undefined}
                        />
                    )}

                    {/* Returning Customer Indicator - hidden in semi-compact */}
                    {compact === 0 && (customerOrderCount > 1 || archivedOrderCount > 0) && (
                        <span
                            className={cn(
                                "inline-flex h-6 items-center gap-1 px-2 text-[11px] font-medium rounded-full cursor-pointer transition-colors",
                                isVerifiedCustomer
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
                                    : (customerOrderCount > 1 ? "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200" : "bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200")
                            )}
                            title={previousOrder ? t("orders.card.previousOrderTip", { id: previousOrder.order_id }) : t("orders.card.totalOrdersTip", { total: customerOrderCount + archivedOrderCount, archived: archivedOrderCount })}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onShowDuplicates) {
                                    onShowDuplicates(order);
                                } else if (previousOrder) {
                                    onViewDetails(previousOrder);
                                }
                            }}
                        >
                            {archivedOrderCount > 0 && customerOrderCount === 1 ? (
                                <>
                                    <HistoryIcon className="w-3 h-3" />
                                    {t("orders.card.historicCustomer", { count: archivedOrderCount })}
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3 h-3" />
                                    {t("orders.card.ordersCount", { count: customerOrderCount + archivedOrderCount })}
                                    {archivedOrderCount > 0 && <span className="opacity-70 text-[11px] mr-1">{t("orders.card.archivedCount", { count: archivedOrderCount })}</span>}
                                </>
                            )}
                        </span>
                    )}

                    {/* Duplicate Reference Tag - Shows original order ID */}

                </div>}
            </motion.div>
        </>
    );
}
