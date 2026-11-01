"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { Truck, AlertTriangle, Package, CalendarClock, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBaseOrderId } from "@/lib/utils";
import { getStatusBadgeStyle, formatScheduledDate } from "@/lib/order-format-utils";
import type { Order } from "@/types/order";
import { canShipWithoutSelection, partitionByShipDay } from "@/lib/order-bulk-scope";
import { findDuplicateDispatchPairs } from "@/lib/duplicate-window";
import { useLanguage } from "@/components/providers/language-provider";

const SAFE_EXPORT_TABS = ["confirmed", "in_transit", "return_pending", "refund_delivered", "refund_failed"] as const;

const STATUS_LABELS: Record<string, string> = {
    all: "All Orders",
    new: "New",
    contacted: "Contacted",
    confirmed: "Confirmed",
    in_transit: "In Transit",
    delivered: "Delivered",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
    no_response: "No Response",
    return_pending: "Return Pending",
    refund_delivered: "Refund Delivered",
    refund_failed: "Refund Failed",
    refunds: "Refunds",
};

interface ShipExportConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    company: "prime" | "waseet";
    orders: Order[];
    currentTab: string;
    hasSelection: boolean;
    /**
     * Whether `orders` is the complete set matching the merchant's filter. When
     * false, "all visible orders" is only the loaded window, so the no-selection
     * path must not claim to be shipping everything.
     */
    ordersAreComplete?: boolean;
    /**
     * Orders scheduled for a later day are left out unless the merchant ticks
     * "include" here; the choice is passed back so the export applies it.
     */
    onConfirmExport: (options: { includeScheduledLater: boolean }) => void;
    /**
     * A committed twin inside 48h for an order (lib/duplicate-window). Orders
     * that have one are listed in a warning: exporting them dispatches a
     * second courier to the same customer.
     */
    getDispatchTwin?: (orderId: string) => Order | undefined;
}

export function ShipExportConfirmationDialog({
    open,
    onOpenChange,
    company,
    orders,
    currentTab,
    hasSelection,
    ordersAreComplete = true,
    onConfirmExport,
    getDispatchTwin,
}: ShipExportConfirmationDialogProps) {
    const { t } = useLanguage();
    const isUnsafeTab = !(SAFE_EXPORT_TABS as readonly string[]).includes(currentTab);
    const isAllTab = currentTab === "all" || !currentTab;
    const countdownDuration = isUnsafeTab ? 8 : 5;

    const [countdown, setCountdown] = useState(countdownDuration);
    const [isExporting, setIsExporting] = useState(false);
    // Off by default: shipping a postponed order early has to be a decision.
    const [includeScheduledLater, setIncludeScheduledLater] = useState(false);

    const handleOpenChange = useCallback((v: boolean) => {
        if (!isExporting) {
            onOpenChange(v);
            if (v) {
                setCountdown(countdownDuration);
                setIsExporting(false);
            }
        }
    }, [isExporting, onOpenChange, countdownDuration]);

    useEffect(() => {
        if (!open || countdown <= 0) return;
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [open, countdown]);

    const { scheduledLater } = useMemo(() => partitionByShipDay(orders), [orders]);
    const exportCount = includeScheduledLater ? orders.length : orders.length - scheduledLater.length;

    // Only the orders this export will actually hand over can double-dispatch.
    const duplicatePairs = useMemo(() => {
        if (!getDispatchTwin) return [];
        const later = new Set(scheduledLater.map(o => o.id));
        const shipping = orders.filter(o => includeScheduledLater || !later.has(o.id));
        return findDuplicateDispatchPairs(
            shipping.map(o => o.id),
            new Map(shipping.map(o => [o.id, o])),
            getDispatchTwin,
        );
    }, [orders, scheduledLater, includeScheduledLater, getDispatchTwin]);

    const companyLabel = company === "prime" ? "Prime" : "Al-Waseet (الوسيط)";
    const tabLabel = STATUS_LABELS[currentTab] || currentTab || "All Orders";

    const statusBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        orders.forEach(o => {
            counts[o.status] = (counts[o.status] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [orders]);

    // "Ship everything visible" is only meaningful when everything IS visible.
    const cannotShipWholeFilter = !canShipWithoutSelection({
        selectedCount: hasSelection ? 1 : 0,
        ordersAreComplete,
    });

    const handleConfirm = async () => {
        if (cannotShipWholeFilter) return;
        if (exportCount === 0) return;
        setIsExporting(true);
        onConfirmExport({ includeScheduledLater });
        setTimeout(() => onOpenChange(false), 300);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="md:max-w-lg" aria-describedby="ship-export-desc">
                <DialogHeader>
                    <DialogTitle className={cn(
                        "flex items-center justify-end gap-2",
                        isUnsafeTab ? "text-amber-700" : "text-slate-800"
                    )}>
                        Export via {companyLabel}
                        <div className={cn(
                            "p-2 rounded-xl",
                            isUnsafeTab ? "bg-amber-100" : "bg-slate-100"
                        )}>
                            <Truck className="h-5 w-5" />
                        </div>
                    </DialogTitle>
                    <DialogDescription id="ship-export-desc" className="text-right">
                        Review the export details before proceeding
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {/* Summary Panel */}
                    <div className={cn(
                        "p-4 rounded-xl border space-y-3",
                        isUnsafeTab
                            ? "bg-amber-50/80 border-amber-200"
                            : "bg-slate-50 border-slate-200"
                    )}>
                        <div className="flex flex-row-reverse justify-between items-center">
                            <span className="text-sm text-gray-600">Exporting from</span>
                            <span className={cn(
                                "text-sm font-semibold px-2.5 py-1 rounded-lg",
                                isUnsafeTab
                                    ? "bg-amber-200/80 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                            )}>
                                {tabLabel}
                            </span>
                        </div>
                        <div className="flex flex-row-reverse justify-between items-center">
                            <span className="text-sm text-gray-600">Orders to export</span>
                            <span className={cn(
                                "text-lg font-bold tabular-nums",
                                exportCount > 30 ? "text-amber-700" : "text-slate-800"
                            )}>
                                {exportCount}
                            </span>
                        </div>
                        {!hasSelection && (
                            ordersAreComplete ? (
                                <div className="flex flex-row-reverse items-center gap-1.5 text-xs text-amber-700 bg-amber-100/80 px-2.5 py-1.5 rounded-lg text-right">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    No orders selected — exporting all {orders.length} orders in this filter
                                </div>
                            ) : (
                                <div className="flex flex-row-reverse items-center gap-1.5 text-xs text-rose-700 bg-rose-100/80 px-2.5 py-1.5 rounded-lg text-right">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    Only {orders.length} of this filter are loaded — select the orders you want to ship
                                </div>
                            )
                        )}
                        {/* Status breakdown for mixed statuses */}
                        {statusBreakdown.length > 1 && (
                            <div className="pt-2 border-t border-gray-200/60">
                                <p className="text-xs text-gray-500 mb-1.5 text-right">Status breakdown:</p>
                                <div className="flex flex-wrap justify-end gap-1.5">
                                    {statusBreakdown.map(([status, count]) => (
                                        <span
                                            key={status}
                                            className={cn(
                                                "text-xs px-2 py-0.5 rounded-md",
                                                getStatusBadgeStyle(status as Order["status"]),
                                            )}
                                        >
                                            {STATUS_LABELS[status] || status}{" "}
                                            <span className="font-semibold">{count}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Postponed orders — held back unless explicitly included */}
                    {scheduledLater.length > 0 && (
                        <div className="p-4 rounded-xl border bg-blue-50 border-blue-200 flex gap-3">
                            <CalendarClock className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-600" />
                            <div className="space-y-2 min-w-0">
                                <p className="text-sm font-semibold text-blue-900">
                                    {scheduledLater.length} {scheduledLater.length === 1 ? "order is" : "orders are"} scheduled for a later day
                                </p>
                                <p className="text-xs text-blue-800">
                                    {includeScheduledLater
                                        ? "They will be shipped today, ahead of their scheduled day."
                                        : "They will be left out of this export and stay in the list for their day."}
                                    {" "}
                                    <span className="text-blue-700/80">
                                        ({scheduledLater.slice(0, 5).map(o => `#${getBaseOrderId(o.order_id)} → ${formatScheduledDate(o.scheduled_date)}`).join(", ")}
                                        {scheduledLater.length > 5 ? ", …" : ""})
                                    </span>
                                </p>
                                <label className="flex items-center gap-2 text-xs font-medium text-blue-900 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeScheduledLater}
                                        onChange={(e) => setIncludeScheduledLater(e.target.checked)}
                                        className="h-4 w-4 rounded border-blue-300"
                                    />
                                    Ship them today anyway
                                </label>
                            </div>
                        </div>
                    )}

                    {/* 48h duplicates — a second courier to the same customer */}
                    {duplicatePairs.length > 0 && (
                        <div
                            data-testid="ship-export-duplicate-warning"
                            className="p-4 rounded-xl border bg-rose-50 border-rose-300 flex gap-3"
                        >
                            <Copy className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-600" />
                            <div className="space-y-1.5 min-w-0">
                                <p className="text-sm font-semibold text-rose-900">
                                    {t("orders.duplicate.exportWarningTitle",
                                        "{count} of these orders already have a committed twin",
                                        { count: duplicatePairs.length })}
                                </p>
                                <p className="text-xs text-rose-800">
                                    {t("orders.duplicate.exportWarningBody",
                                        "Same customer within 48 hours — shipping both means two delivery fees. Cancel or merge the duplicate first, or deselect it.")}
                                </p>
                                <ul className="space-y-0.5 text-xs text-rose-800">
                                    {duplicatePairs.slice(0, 5).map(({ order, twin }) => (
                                        <li key={order.id} className="font-mono" dir="ltr">
                                            #{getBaseOrderId(order.order_id)} ↔ #{getBaseOrderId(twin.order_id)}
                                            {" · "}{STATUS_LABELS[twin.status] || twin.status}
                                        </li>
                                    ))}
                                    {duplicatePairs.length > 5 && <li>…</li>}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Unsafe tab warning */}
                    {isUnsafeTab && (
                        <div className={cn(
                            "p-4 rounded-xl border flex gap-3",
                            isAllTab
                                ? "bg-red-50 border-red-200"
                                : "bg-amber-50 border-amber-200"
                        )}>
                            <AlertTriangle className={cn(
                                "h-5 w-5 flex-shrink-0 mt-0.5",
                                isAllTab ? "text-red-500" : "text-amber-500"
                            )} />
                            <div className="space-y-1">
                                <p className={cn(
                                    "text-sm font-semibold",
                                    isAllTab ? "text-red-800" : "text-amber-800"
                                )}>
                                    {isAllTab
                                        ? "Warning: Exporting from All Orders"
                                        : `Warning: Exporting from "${tabLabel}" tab`
                                    }
                                </p>
                                <p className={cn(
                                    "text-xs",
                                    isAllTab ? "text-red-700" : "text-amber-700"
                                )}>
                                    {isAllTab
                                        ? "This includes ALL orders across every status. This is very unusual and may include orders that should not be shipped. Please verify this is intentional."
                                        : "This tab may include orders that are not ready for shipping. Usually exports are done from the Confirmed or In Transit tabs."
                                    }
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Large count warning */}
                    {orders.length > 30 && !isUnsafeTab && (
                        <div className="p-3 rounded-xl border bg-amber-50/60 border-amber-200 flex items-center gap-2">
                            <Package className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700">
                                Large export — <span className="font-semibold">{orders.length}</span> orders. Please verify this is correct.
                            </p>
                        </div>
                    )}

                    {/* Order preview list */}
                    <div className="max-h-40 overflow-y-auto p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <ul className="space-y-1.5">
                            {orders.slice(0, 50).map(order => (
                                <li
                                    key={order.id}
                                    className="text-sm text-gray-700 flex flex-row-reverse justify-between items-center bg-white/70 px-2.5 py-1.5 rounded-lg border border-gray-100/50"
                                >
                                    <span className="font-medium truncate max-w-[200px]">{order.customer_name}</span>
                                    <div className="flex flex-row-reverse items-center gap-2">
                                        <span className={cn(
                                            "text-[11px] px-1.5 py-0.5 rounded",
                                            getStatusBadgeStyle(order.status),
                                        )}>
                                            {STATUS_LABELS[order.status] || order.status}
                                        </span>
                                        <span className="text-gray-500 font-mono text-xs font-bold px-1.5 py-0.5 bg-gray-100 rounded-md">
                                            #{getBaseOrderId(order.order_id)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                            {orders.length > 50 && (
                                <li className="text-xs text-gray-400 text-center py-1">
                                    +{orders.length - 50} more orders
                                </li>
                            )}
                        </ul>
                    </div>
                </div>

                <DialogFooter>
                    <button
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={countdown > 0 || isExporting || cannotShipWholeFilter || exportCount === 0}
                        className={cn(
                            "px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 min-w-[180px]",
                            (countdown > 0 || cannotShipWholeFilter || exportCount === 0)
                                ? isUnsafeTab
                                    ? "bg-red-200 text-red-400 cursor-not-allowed"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : isUnsafeTab
                                    ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20"
                                    : "bg-slate-800 text-white hover:bg-slate-700 shadow-lg shadow-slate-900/20"
                        )}
                    >
                        <Truck className="h-4 w-4" />
                        {cannotShipWholeFilter
                            ? "Select orders first"
                            : countdown > 0
                            ? `Wait ${countdown}s...`
                            : isExporting
                                ? "Exporting..."
                                : `Export ${exportCount} Orders`
                        }
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
