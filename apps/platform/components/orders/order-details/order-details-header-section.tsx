"use client";

import { DialogTitle } from "@scheniders/ui/dialog";
import { getBaseOrderId } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { scheduleDayFromToday } from "@/lib/order-format-utils";
import { toBaghdadDayKey } from "@/lib/order-window";
import type { Order } from "@/lib/supabase";
import { PresenceAvatarGroup } from "../presence-avatar-group";
import { AbandonedCartBadge } from "../abandoned-cart-badge";
import { Calendar, MessageCircle, Edit2, X, CheckCircle, Flag, Flame, History, AlertTriangle, Minus, Sun, PackagePlus, Ban } from "lucide-react";
import { RefundBanner } from "../refund-banner";
import { RefundEntry } from "../refund-entry";
import { ReplaceEntry } from "../replace-entry";
import { ReplacementBanner } from "../replacement-banner";
import { AfterSaleLossChip } from "../after-sale-loss-chip";
import type { OrderDetailsView } from "./use-order-details-model";

/** One section of OrderDetailsModal. */
export function OrderDetailsHeaderSection({ m }: { m: OrderDetailsView }) {
    const { onClose, onUpdate, onStatusUpdate, order, setOrder, showStatusDropdown, setShowStatusDropdown, t, orderStatusLabel, isEditing, handleEdit, isEditingId, tempOrderId, idError, isCheckingId, showIdWarning, setShowIdWarning, idCountdown, isSavingId, startIdEdit, cancelIdEdit, handleIdChange, initiateIdSave, confirmIdSave, isBlacklisted, canUnblock, canBlock, startOrderConv, setBlacklistDialogOpen, setBlacklistDialogMode, activeTab, setActiveTab, handleStatusChange, quickActions, handleReorder, handleDiscuss, getStatusBadgeStyle } = m;
    return (
        <>
            {/* Top Row: Order ID and Control Buttons */}
            <div className="flex items-start justify-between mb-1">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="relative group/id flex items-center gap-2">
                            <DialogTitle className="font-mono text-xl flex items-center gap-1.5">
                                {order.order_id?.startsWith('CHK-') ? (
                                    <>
                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-bold">CHK</span>
                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-bold">
                                            {getBaseOrderId(order.order_id)}
                                        </span>
                                    </>
                                ) : (
                                    `#${getBaseOrderId(order.order_id)}`
                                )}
                            </DialogTitle>
                            {!isEditingId && (
                                <button
                                    onClick={startIdEdit}
                                    className="absolute -top-1 -right-3 p-1 text-muted hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all opacity-0 group-hover/id:opacity-100 bg-white shadow-sm border border-gray-100"
                                    title={t("orders.tip.editOrderId")}
                                >
                                    <Edit2 className="w-2.5 h-2.5" />
                                </button>
                            )}
                        </div>
                        <AbandonedCartBadge order={order} withDetail className="text-[11px] px-2 py-1" />
                        {/* Status Badge with Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                                data-status={order.is_return ? "return" : order.status}
                                className={cn(
                                    "inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider transition-all cursor-pointer hover:opacity-80",
                                    getStatusBadgeStyle()
                                )}
                            >
                                {orderStatusLabel(order.status, order.is_return)}
                            </button>

                            {/* Status Dropdown Menu */}
                            {showStatusDropdown && onStatusUpdate && (
                                <div data-status-menu="" className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 p-3 z-50 min-w-[240px] max-h-[500px] overflow-y-auto">
                                    <div className="space-y-1.5">
                                        {quickActions.map((action) => {
                                            const Icon = action.icon;
                                            const isCurrentStatus = order.status === action.status;
                                            return (
                                                <button
                                                    key={action.status}
                                                    data-status-option={action.status}
                                                    data-current={isCurrentStatus ? "" : undefined}
                                                    onClick={() => {
                                                        handleStatusChange(action.status);
                                                        setShowStatusDropdown(false);
                                                    }}
                                                    disabled={isCurrentStatus}
                                                    className={cn(
                                                        "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-all rounded-lg",
                                                        action.bgColor,
                                                        action.textColor,
                                                        isCurrentStatus
                                                            ? "ring-2 ring-offset-2 shadow-sm cursor-default font-bold"
                                                            : cn(action.hoverColor, "cursor-pointer hover:shadow-sm")
                                                    )}
                                                >
                                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                                    <span className="flex-1 text-left">{action.label}</span>
                                                    {isCurrentStatus && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Blacklist toggle icon */}
                        {isBlacklisted(order.phone) && !canUnblock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-gray-900 text-white border border-gray-800">
                                <Ban className="w-3 h-3" />
                                {t("orderDetail.blacklisted")}
                            </span>
                        ) : isBlacklisted(order.phone) ? (
                            <button
                                onClick={() => { setBlacklistDialogMode("remove"); setBlacklistDialogOpen(true); }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-gray-900 text-white border border-gray-800 hover:bg-gray-700 transition-all"
                                title={t("orderDetail.unblacklist")}
                            >
                                <Ban className="w-3 h-3" />
                                {t("orderDetail.blacklisted")}
                            </button>
                        ) : canBlock ? (
                            <button
                                onClick={() => { setBlacklistDialogMode("add"); setBlacklistDialogOpen(true); }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-500 border border-gray-200 hover:bg-red-100 hover:text-red-600 hover:border-red-200 transition-all"
                                title={t("orderDetail.addBlacklist")}
                            >
                                <Ban className="w-3.5 h-3.5" />
                            </button>
                        ) : null}
                    </div>
                    {/* Arrival date (YYYY-MM-DD), Baghdad day — the UTC day is a day early after midnight */}
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                        <Calendar className="h-3 w-3" />
                        {toBaghdadDayKey(order.created_at)}
                    </span>
                    <RefundBanner order={order} />
                    <ReplacementBanner order={order} />
                    <AfterSaleLossChip phone={order.phone} />
                    {/* Action Buttons Row - Reorder, Return, Replace */}
                    {!isEditing && (
                        <div className="flex items-center gap-2 mt-1">
                            {/* Reorder Button - Always show */}
                            <button
                                onClick={handleReorder}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all text-xs font-medium dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/40"
                            >
                                <PackagePlus className="h-3.5 w-3.5" />
                                {t("orderDetail.reorder")}
                            </button>
                            {/* Refund - only for delivered/completed orders */}
                            {(order.status === "delivered" || order.status === "completed") && !order.is_return && !order.is_replacement && (
                                <RefundEntry order={order} />
                            )}
                            {(order.status === "delivered" || order.status === "completed") && !order.is_return && !order.is_replacement && (
                                <ReplaceEntry order={order} />
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    {/* Control Buttons Row */}
                    <div className="flex items-center gap-2">
                        {/* Presence Indicators */}
                        <PresenceAvatarGroup orderId={order.id} className="mr-2 hidden sm:flex" />

                    {/* Edit ID Warning Modal */}
                    {showIdWarning && (
                        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border-2 border-red-100 animate-in fade-in zoom-in duration-200">
                                <div className="flex flex-col items-center text-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                                        <AlertTriangle className="w-8 h-8 text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">{t("orderDetail.warningChangeId")}</h3>
                                        <p className="text-sm text-gray-500 mt-2">
                                            {t("orderDetail.warningChangeIdDesc")}
                                        </p>
                                        <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="flex items-center justify-center gap-2 text-sm">
                                                <span className="text-muted line-through">#{order.order_id}</span>
                                                <span className="text-gray-400">→</span>
                                                <span className="font-bold text-foreground">#{tempOrderId}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-full pt-2">
                                        <button
                                            onClick={confirmIdSave}
                                            disabled={idCountdown > 0 || isSavingId}
                                            className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"
                                        >
                                            {idCountdown > 0 ? (
                                                <span>{t("orderDetail.waitConfirm").replace("{n}", String(idCountdown))}</span>
                                            ) : isSavingId ? (
                                                <span>{t("orderDetail.saving")}</span>
                                            ) : (
                                                <span>{t("orderDetail.confirmChange")}</span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowIdWarning(false)}
                                            className="mt-3 text-sm text-muted hover:text-foreground font-medium"
                                        >
                                            {t("orderDetail.cancel")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ID Editing UI */}
                    {isEditingId && (
                        <div className="absolute top-4 left-6 z-10 flex items-center gap-2 bg-white p-1 rounded-lg shadow-lg border border-gray-100">
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted font-mono text-sm">#</span>
                                <input
                                    value={tempOrderId}
                                    onChange={(e) => handleIdChange(e.target.value)}
                                    className={cn(
                                        "pl-6 pr-2 py-1.5 w-40 text-sm font-bold font-mono border rounded-md focus:outline-none focus:ring-2",
                                        idError ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-blue-100"
                                    )}
                                    placeholder={t("orders.tip.orderIdPlaceholder")}
                                    autoFocus
                                />
                                {isCheckingId && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={initiateIdSave}
                                disabled={!!idError || !tempOrderId}
                                className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50"
                            >
                                <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                                onClick={cancelIdEdit}
                                className="p-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {/* Error Tooltip */}
                            {idError && (
                                <div className="absolute top-full left-0 mt-2 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-20">
                                    {idError}
                                    <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 rotate-45" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Control Buttons - History, Edit, Close */}
                    {/* Timeline/History Button */}
                    <button
                        onClick={() => setActiveTab(activeTab === "timeline" ? "details" : "timeline")}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            activeTab === "timeline"
                                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                : "bg-white border-[var(--card-border)] text-foreground hover:bg-gray-50"
                        )}
                    >
                        <History className="h-3.5 w-3.5" />
                        {t("orderDetail.history")}
                    </button>
                    {/* Discuss Button */}
                    <button
                        onClick={handleDiscuss}
                        disabled={startOrderConv.isPending}
                        title={t("chat.discussOrder", "Discuss")}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {t("chat.discussOrder", "Discuss")}
                    </button>
                    {/* Edit Button */}
                    {!isEditing && (
                        <button
                            onClick={handleEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[var(--card-border)] text-foreground hover:bg-gray-50 transition-all text-xs font-medium"
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                            {t("orderDetail.edit")}
                        </button>
                    )}
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                        aria-label={t("orders.tip.close")}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                    </div>

                    {/* Urgency Buttons Container */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-[var(--card-border)]">
                        {/* Priority Icons */}
                        {[
                            { value: 'normal', label: t("orderDetail.priority.normal"), icon: Minus, color: "text-gray-500 hover:bg-gray-100" },
                            { value: 'high', label: t("orderDetail.priority.high"), icon: Flag, color: "text-amber-600 hover:bg-amber-50" },
                            { value: 'urgent', label: t("orderDetail.priority.urgent"), icon: Flame, color: "text-red-600 hover:bg-red-50" },
                        ].map((p) => {
                            const Icon = p.icon;
                            const isActive = order.priority === p.value || (!order.priority && p.value === 'normal');
                            return (
                                <button
                                    key={p.value}
                                    onClick={async () => {
                                        if (!order) return;
                                        const oldPriority = order.priority;
                                        const newPriority = p.value as Order["priority"];
                                        setOrder(prev => prev ? { ...prev, priority: newPriority } : null);

                                        const result = await onUpdate(order.id, { priority: newPriority } as Partial<Order>);
                                        if (!result.success) {
                                            setOrder(prev => prev ? { ...prev, priority: oldPriority } : null);
                                        }
                                    }}
                                    className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95",
                                        isActive
                                            ? "bg-[var(--ink)] text-white shadow-sm"
                                            : p.color
                                    )}
                                    title={p.label}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                </button>
                            );
                        })}

                        {/* Tomorrow Icon */}
                        <button
                            onClick={async () => {
                                if (!order) return;
                                const dateStr = scheduleDayFromToday(1);

                                const oldDate = order.scheduled_date;
                                setOrder(prev => prev ? { ...prev, scheduled_date: dateStr } : null);

                                const result = await onUpdate(order.id, { scheduled_date: dateStr } as Partial<Order>);
                                if (!result.success) {
                                    setOrder(prev => prev ? { ...prev, scheduled_date: oldDate } : null);
                                }
                            }}
                            className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 text-blue-600 hover:bg-blue-50",
                                order.scheduled_date === scheduleDayFromToday(1) && "bg-blue-100 ring-1 ring-blue-200"
                            )}
                            title={t("orderDetail.tomorrow")}
                        >
                            <Sun className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
