"use client";

import { createPortal } from "react-dom";
import { Order } from "@/lib/supabase";
import { copyOrderToClipboard, cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { FollowUpCueBadge } from "../follow-up-cue-badge";
import { MessageCircle, Edit, XCircle, Ban, ShieldCheck, PhoneCall, CheckCircle, Truck, RotateCcw, Pin, Copy, CopyPlus, MoreVertical, Camera, Scissors } from "lucide-react";
import type { OrderCardModel } from "./use-order-card-model";
import { PrimeTrackToggle } from "./prime-track-toggle";

/** One section of the full order card; see FullOrderCard in ../order-card.tsx. */
export function FullCardActions({ m }: { m: OrderCardModel }) {
    const { actionDock, actionsOpen, actionsRef, compact, followUp, hoursSinceCreated, isBlacklisted, isLoading, isPinned, isReturn, language, menuPosition, menuRef, messageTemplates, onAddToBlacklist, onCancelWithReason, onCloneOrder, onOpenTemplatePanel, onRejectWithReason, onRemoveFromBlacklist, onScreenshot, onSplit, onStatusUpdate, onTogglePin, onViewDetails, openWhatsApp, order, setActionsOpen, setBlacklistDialogMode, setBlacklistDialogOpen, setMenuPosition, t } = m;
    return (
        <>
            {/* ACTION BUTTONS - Desktop only */}
            <div className={cn(
                // Fixed width (six buttons) so the price column lines up on every card.
                "hidden md:flex flex-shrink-0 items-center justify-end md:min-w-[280px]",
                actionDock
                    ? "bg-black/5 dark:bg-[#1A1A1A] p-1 gap-1 flex-row rounded-2xl border border-black/5 dark:border-white/5 shadow-inner"
                    : "gap-2"
            )}>
                {/* Prime band on/off, on cards whose parcel is with Prime */}
                <PrimeTrackToggle order={order} docked={actionDock} />

                {/* Follow-up cue badge */}
                {followUp && (
                    <FollowUpCueBadge
                        state={followUp}
                        hoursSinceCreated={Math.floor(hoursSinceCreated)}
                    />
                )}

                {/* Chat Button - Primary with Contact Stage Indicator */}
                {(() => {
                    const contactCount = order.contact_count || 0;
                    const isValidPhone = validatePhoneDetailed(order.phone).isValid;

                    // Dynamic styling based on contact count
                    const getButtonStyle = () => {
                        if (!isValidPhone) return "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none";
                        switch (contactCount) {
                            case 0: return "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)] shadow-[0_0_10px_rgba(239,255,0,0.2)] font-bold dark:bg-[rgba(239,255,0,0.1)] dark:text-[#EFFF00] dark:shadow-[0_0_10px_rgba(239,255,0,0.1)] dark:hover:shadow-[0_0_15px_rgba(239,255,0,0.3)] dark:hover:bg-[rgba(239,255,0,0.15)]"; // Neon - New
                            case 1: return "bg-yellow-500 text-white hover:bg-yellow-600 shadow-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:shadow-none"; // Yellow - Contacted once
                            case 2: return "bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:shadow-none"; // Orange - Contacted twice
                            default: return "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:shadow-none"; // Red - Multiple contacts
                        }
                    };

                    const getBadgeStyle = () => {
                        switch (contactCount) {
                            case 0: return "bg-white text-green-600 border-green-200 dark:bg-[#1E1E1E] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.3)]";
                            case 1: return "bg-white text-yellow-600 border-yellow-200 dark:bg-[#1E1E1E] dark:text-yellow-400 dark:border-yellow-500/30";
                            case 2: return "bg-white text-orange-600 border-orange-200 dark:bg-[#1E1E1E] dark:text-orange-400 dark:border-orange-500/30";
                            default: return "bg-white text-red-600 border-red-200 dark:bg-[#1E1E1E] dark:text-red-400 dark:border-red-500/30";
                        }
                    };

                    const getTitle = () => {
                        if (!isValidPhone) return language === "ar" ? validatePhoneDetailed(order.phone).errorMessageAr : validatePhoneDetailed(order.phone).errorMessage;
                        switch (contactCount) {
                            case 0: return t("orders.card.wa0");
                            case 1: return t("orders.card.wa1");
                            case 2: return t("orders.card.wa2");
                            default: return t("orders.card.waN", { count: contactCount });
                        }
                    };

                    return (
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
                                "w-10 h-10 transition-all flex items-center justify-center relative",
                                actionDock ? "rounded-xl shadow-none" : "rounded-xl shadow-md",
                                getButtonStyle()
                            )}
                            title={getTitle()}
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className={cn(
                                "absolute -top-1 -right-1 w-4 h-4 rounded-full text-[11px] font-bold flex items-center justify-center shadow-sm border",
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
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openWhatsApp(order.secondary_phone);
                        }}
                        className={cn(
                            "w-10 h-10 bg-emerald-500 text-white hover:bg-emerald-600 transition-all flex items-center justify-center relative dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA] dark:hover:bg-[rgba(0,255,100,0.25)]",
                            actionDock ? "rounded-xl shadow-none" : "rounded-xl shadow-md shadow-emerald-500/20 dark:shadow-none"
                        )}
                        title={t("orders.tip.whatsappSecondary")}
                    >
                        <MessageCircle className="w-4 h-4" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full text-[11px] font-bold text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-200 dark:bg-[#1E1E1E] dark:border-[rgba(0,255,100,0.3)] dark:text-[#00FFAA]">
                            {(order.contact_count || 0) > 0 ? ((order.contact_count || 0) > 9 ? "9+" : order.contact_count) : ""}
                        </span>
                    </button>
                )}

                {/* Edit Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                    className={cn(
                        "w-10 h-10 flex items-center justify-center transition-all bg-[var(--background)] text-foreground hover:bg-[var(--card-border)] dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/5",
                        actionDock
                            ? "rounded-xl border-transparent bg-transparent dark:bg-transparent dark:border-transparent"
                            : "rounded-xl border border-[var(--card-border)] dark:bg-black/20 dark:border-white/5 dark:hover:border-white/20"
                    )}
                    title={t("orders.tip.editOrder")}
                >
                    <Edit className="w-4 h-4" />
                </button>

                {/* More Actions Dropdown - hidden in semi-compact */}
                {compact === 0 && <div ref={actionsRef} className={cn("relative", actionsOpen && "z-50")}>
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
                            "w-10 h-10 transition-all flex items-center justify-center",
                            actionDock ? "rounded-xl border-transparent" : "rounded-xl border",
                            actionsOpen
                                ? (actionDock ? "bg-black/5 text-gray-700 dark:bg-white/10 dark:text-white" : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-white/10 dark:border-white/20 dark:text-white")
                                : (actionDock ? "bg-transparent text-muted hover:bg-black/5 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/5" : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:bg-[var(--card-border)] dark:bg-black/20 dark:border-white/5 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:border-white/20 dark:hover:bg-white/5")
                        )}
                        title={t("orders.tip.moreActions")}
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
                            className="bg-[var(--card-bg)] rounded-2xl shadow-lg border border-[var(--card-border)] py-2 min-w-[140px] dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] dark:border-[#333]"
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
                                <span className="font-medium">{t("orders.ui.copy")}</span>
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
                                    <span className="font-medium">{t("orders.ui.clone")}</span>
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
                                    <span className="font-medium">{t("orders.ui.share")}</span>
                                </button>
                            )}

                            {/* Blacklist toggle */}
                            {(isBlacklisted ? onRemoveFromBlacklist : onAddToBlacklist) && (
                                <>
                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />
                                    {isBlacklisted ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setBlacklistDialogMode("remove");
                                                setBlacklistDialogOpen(true);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-emerald-700 hover:bg-emerald-50/70 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                            </div>
                                            <span className="font-medium">{t("orderDetail.unblacklist")}</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setBlacklistDialogMode("add");
                                                setBlacklistDialogOpen(true);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-red-700 hover:bg-red-50/70 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                                                <Ban className="w-3.5 h-3.5 text-red-600" />
                                            </div>
                                            <span className="font-medium">{t("orderDetail.addBlacklist")}</span>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>,

                        document.body
                    )}
                </div>}

                {/* Split Order Button - Only for confirmed/in_transit with multiple items */}
                {onSplit && (order.status === 'confirmed' || order.status === 'in_transit') && (order.items && order.items.length > 1) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSplit(order);
                        }}
                        className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all flex items-center justify-center"
                        title={t("orders.tip.splitOrder")}
                    >
                        <Scissors className="w-4 h-4" />
                    </button>
                )}

                {/* Undo Status Button - Only for terminal/advanced statuses */}
                {["delivered", "completed", "rejected", "cancelled", "no_response", "return_pending"].includes(order.status) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            let prevStatus: Order["status"] = "in_transit";
                            if (order.status === "cancelled" || order.status === "no_response") {
                                prevStatus = "contacted";
                            } else if (order.status === "return_pending") {
                                prevStatus = "delivered";
                            }
                            onStatusUpdate(order.id, prevStatus);
                        }}
                        disabled={isLoading}
                        className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-all flex items-center justify-center disabled:opacity-50 dark:bg-white/10 dark:border-white/20 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/20"
                        title={t("orders.card.undoStatus")}
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )}

                {/* Quick Status Actions. The one that moves the order to its next
                    stage carries data-next-step="<target status>", so dark mode can colour it
                    and quiet the rest (orders-dark.css). */}
                {order.status !== "completed" && order.status !== "rejected" && order.status !== "cancelled" && order.status !== "no_response" && (
                    <>
                        {/* Contacted - Pastel Yellow */}
                        {order.status === "new" && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStatusUpdate(order.id, "contacted");
                                }}
                                data-next-step="contacted"
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] text-amber-800 hover:bg-[var(--pastel-yellow-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                title={t("orders.tip.markContacted")}
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
                                data-next-step={order.status === "contacted" ? "confirmed" : undefined}
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] text-green-800 hover:bg-[var(--pastel-green-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                title={t("orders.tip.markConfirmed")}
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
                                data-next-step="in_transit"
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200 transition-all flex items-center justify-center disabled:opacity-50"
                                title={t("orders.tip.markInTransit")}
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
                                data-next-step="delivered"
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-[var(--pastel-mint)] text-teal-800 hover:bg-[var(--pastel-mint-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                title={t("orders.tip.markDelivered")}
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
                                title={t("orders.tip.markRejected")}
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
                                data-next-step="completed"
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-2 ring-emerald-300/50 transition-all flex items-center justify-center disabled:opacity-50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                title={t("orders.card.markComplete")}
                            >
                                <CheckCircle className="w-4 h-4" />
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
                                title={t("orders.card.noResponse")}
                            >
                                <PhoneCall className="w-4 h-4" />
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
                                title={t("orders.tip.cancelOrder")}
                            >
                                <Ban className="w-4 h-4" />
                            </button>
                        )}

                        {/* Refund Status Actions - For orders in return_pending */}
                        {order.status === "return_pending" && isReturn && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusUpdate(order.id, "refund_delivered");
                                    }}
                                    data-next-step="refund_delivered"
                                    disabled={isLoading}
                                    className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-2 ring-emerald-300/50 transition-all flex items-center justify-center disabled:opacity-50"
                                    title={t("orders.card.refundDelivered")}
                                >
                                    <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusUpdate(order.id, "refund_failed");
                                    }}
                                    disabled={isLoading}
                                    className="w-10 h-10 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 ring-2 ring-red-300/50 transition-all flex items-center justify-center disabled:opacity-50"
                                    title={t("orders.card.refundFailed")}
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
