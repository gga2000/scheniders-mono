"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { useLanguage } from "@/hooks/use-language";
import { cn, getBaseOrderId } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { withOrderModalBoundary } from "@/components/orders/order-modal-boundary";
import type { OrderBulkOperations } from "@/hooks/use-order-bulk-operations";
import type { Order } from "@/types/order";
import { useResolvedOrders } from "@/hooks/use-resolved-orders";
import { partitionForReschedule } from "@/lib/order-bulk-scope";
import { formatScheduledDate, scheduleDayFromToday } from "@/lib/order-format-utils";
import { DateTimePicker } from "@scheniders/ui/datetime-picker";

const FloatingActionBar = dynamic(
    () => import("@/components/orders/floating-action-bar").then(mod => ({ default: mod.FloatingActionBar })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const ExportReportModal = withOrderModalBoundary(
    "ExportReportModal",
    dynamic(
        () => import("@/components/orders/export-report-modal").then(mod => ({ default: mod.ExportReportModal })),
        { loading: () => null, ssr: false }
    )
);
const ShipExportConfirmationDialog = withOrderModalBoundary(
    "ShipExportConfirmationDialog",
    dynamic(
        () => import("@/components/orders/ship-export-confirmation-dialog").then(mod => ({ default: mod.ShipExportConfirmationDialog })),
        { loading: () => null, ssr: false }
    )
);
const MoveToTransitDialog = withOrderModalBoundary(
    "MoveToTransitDialog",
    dynamic(
        () => import("@/components/orders/move-to-transit-dialog").then(mod => ({ default: mod.MoveToTransitDialog })),
        { loading: () => null, ssr: false }
    )
);

/**
 * The dialogs that act on a SELECTION rather than on one order: the floating
 * action bar, the processing overlay, the export report, the delete
 * confirmation, and the courier export with its post-export prompt.
 *
 * ARCH-1: these were inline in `page.tsx`. They take one prop — the return of
 * `useOrderBulkOperations`, which owns the behaviour they trigger — and read
 * everything else from the same store and context the page does, so extracting
 * them did not turn into eighteen props pointing back at the page.
 */
export function OrderBulkDialogs({
    bulk,
    getDispatchTwin,
}: {
    bulk: OrderBulkOperations;
    /** A committed 48h twin for an order — the courier export warns about these. */
    getDispatchTwin?: (orderId: string) => Order | undefined;
}) {
    const { t } = useLanguage();
    const { orders, filteredOrders, filters, ordersAreComplete } = useOrdersContext();
    const { selectedOrders, isExportModalOpen, setIsExportModalOpen } = useOrderStore(
        useShallow((s) => ({
            selectedOrders: s.selectedOrders,
            isExportModalOpen: s.isExportModalOpen,
            setIsExportModalOpen: s.setIsExportModalOpen,
        })),
    );

    const {
        isBulkProcessing,
        bulkActions,
        deleteConfirmOpen,
        setDeleteConfirmOpen,
        deleteCountdown,
        setDeleteCountdown,
        isDeleting,
        executeDelete,
        shipConfirmOpen,
        setShipConfirmOpen,
        shipConfirmCompany,
        shipConfirmKey,
        handleShipExport,
        moveTransitOpen,
        setMoveTransitOpen,
        pendingTransitIds,
        handleConfirmMoveToTransit,
        rescheduleOpen,
        setRescheduleOpen,
        executeReschedule,
    } = bulk;

    // Every selected order, including ones picked from a search (any date) or
    // left selected after the search was cleared: the window alone listed none
    // of those.
    const toDelete = useResolvedOrders(selectedOrders, [orders, filteredOrders], deleteConfirmOpen);
    const toReschedule = useResolvedOrders(selectedOrders, [orders, filteredOrders], rescheduleOpen);

    return (
        <>
            <FloatingActionBar
                selectedCount={selectedOrders.size}
                onConfirm={bulkActions.confirm}
                onReject={bulkActions.reject}
                onArchive={bulkActions.archive}
                onDelete={bulkActions.remove}
                disabled={isBulkProcessing}
            />

            {/* Export Report Modal */}
            <ExportReportModal
                open={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                filteredOrders={filteredOrders}
                selectedOrderIds={selectedOrders}
                currentDateFrom={filters.dateFrom}
                currentDateTo={filters.dateTo}
            />


            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={(open) => {
                if (!isDeleting) {
                    setDeleteConfirmOpen(open);
                    if (!open) setDeleteCountdown(5);
                }
            }}>
                <DialogContent className="md:max-w-md" aria-describedby="delete-confirm-desc">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">
                            {t("orders.deleteConfirm.title")}
                        </DialogTitle>
                        <DialogDescription id="delete-confirm-desc">
                            {t("orders.deleteConfirm.description").replace("{count}", String(selectedOrders.size))}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <div className="max-h-48 overflow-y-auto p-3 bg-rose-50 rounded-xl border border-rose-100">
                            <ul className="space-y-2" data-testid="delete-confirm-list">
                                {toDelete.orders.map(order => (
                                    <li key={order.id} className="text-sm text-rose-900 flex justify-between items-center bg-white/50 p-2 rounded-lg border border-rose-100/50">
                                        <span className="font-medium truncate max-w-[200px]">{order.customer_name}</span>
                                        <span className="text-rose-600 font-mono text-xs font-bold px-2 py-0.5 bg-rose-100 rounded-md">#{getBaseOrderId(order.order_id)}</span>
                                    </li>
                                ))}
                                {toDelete.pending && (
                                    <li className="text-sm text-rose-700/80 p-2">{t("common.loading")}</li>
                                )}
                                {toDelete.missing > 0 && (
                                    <li className="text-sm text-rose-700/80 p-2">
                                        {t("orders.deleteConfirm.missing").replace("{count}", String(toDelete.missing))}
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <button
                            onClick={() => {
                                setDeleteConfirmOpen(false);
                                setDeleteCountdown(5);
                            }}
                            disabled={isDeleting}
                            className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            onClick={executeDelete}
                            disabled={deleteCountdown > 0 || isDeleting}
                            className={cn(
                                "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                                deleteCountdown > 0
                                    ? "bg-red-200 text-red-400 cursor-not-allowed"
                                    : "bg-red-600 text-white hover:bg-red-700"
                            )}
                        >
                            {deleteCountdown > 0 ? t("orderDetail.waitDelete").replace("{n}", String(deleteCountdown)) : isDeleting ? t("common.deleting") : t("orders.deleteConfirm.button").replace("{count}", String(selectedOrders.size))}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Keyed on open so each use starts with no day picked. */}
            <RescheduleDialog
                key={rescheduleOpen ? "open" : "closed"}
                open={rescheduleOpen}
                onOpenChange={setRescheduleOpen}
                resolved={toReschedule}
                disabled={isBulkProcessing}
                onConfirm={(day) => {
                    const { reschedulable, skipped } = partitionForReschedule(toReschedule.orders);
                    void executeReschedule(reschedulable.map(o => o.id), day, skipped.map(o => o.id));
                }}
            />

            {/* Ship Export Confirmation Dialog */}
            <ShipExportConfirmationDialog
                key={shipConfirmKey}
                open={shipConfirmOpen}
                onOpenChange={setShipConfirmOpen}
                company={shipConfirmCompany}
                orders={selectedOrders.size > 0
                    ? orders.filter(o => selectedOrders.has(o.id))
                    : filteredOrders
                }
                currentTab={filters.status || 'all'}
                hasSelection={selectedOrders.size > 0}
                ordersAreComplete={ordersAreComplete}
                getDispatchTwin={getDispatchTwin}
                onConfirmExport={(options) => handleShipExport(shipConfirmCompany, options)}
            />

            {/* Post-export: prompt to move exported orders to In Transit */}
            <MoveToTransitDialog
                open={moveTransitOpen}
                onOpenChange={setMoveTransitOpen}
                count={pendingTransitIds.length}
                onConfirm={handleConfirmMoveToTransit}
            />

        </>
    );
}

/**
 * Pick the day to postpone the selection to. Previews how many orders will
 * move and how many are held back (finished or already with the courier), so
 * nothing is changed that the merchant did not see counted.
 */
function RescheduleDialog({
    open,
    onOpenChange,
    resolved,
    disabled,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    resolved: { orders: Order[]; pending: boolean; missing: number };
    disabled: boolean;
    /** `null` clears the postponement. */
    onConfirm: (day: string | null) => void;
}) {
    const { t } = useLanguage();
    // undefined = nothing picked yet; null = "clear postponement" chosen.
    const [day, setDay] = useState<string | null | undefined>(undefined);
    const { reschedulable, skipped } = partitionForReschedule(resolved.orders);
    const today = scheduleDayFromToday(0);
    const dayIsValid = day === null || (typeof day === "string" && day >= today);
    const canConfirm = !disabled && !resolved.pending && reschedulable.length > 0 && day !== undefined && dayIsValid;

    const preview = day === undefined
        ? null
        : day === null
            ? t("orders.bulk.reschedule.previewClear")
            : t("orders.bulk.reschedule.previewMove").replace("{date}", formatScheduledDate(day));

    const quick = (label: string, value: string | null, tone: "blue" | "plain") => (
        <button
            type="button"
            onClick={() => setDay(value)}
            className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                day === value ? "ring-2 ring-sky-400" : "",
                tone === "blue" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "text-muted hover:bg-gray-100",
            )}
        >
            {label}
        </button>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md" aria-describedby="reschedule-desc">
                <DialogHeader>
                    <DialogTitle>{t("orders.bulk.reschedule.title")}</DialogTitle>
                    <DialogDescription id="reschedule-desc">{t("orders.bulk.reschedule.description")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div>
                        <span className="block text-xs text-muted uppercase tracking-wider mb-1.5">
                            {t("orders.bulk.reschedule.pick")}
                        </span>
                        <DateTimePicker
                            value={typeof day === "string" ? `${day}T00:00:00` : null}
                            onChange={(iso) => setDay(new Date(iso).toLocaleDateString("en-CA"))}
                            showTime={false}
                            minDate="now"
                            className="h-[38px]"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {quick(t("orders.bulk.reschedule.tomorrow"), scheduleDayFromToday(1), "blue")}
                        {quick(t("orders.bulk.reschedule.inThreeDays"), scheduleDayFromToday(3), "blue")}
                        {quick(t("orders.bulk.reschedule.clear"), null, "plain")}
                    </div>
                    <div className="rounded-xl bg-[var(--background)] border border-[var(--card-border)] p-3 text-sm space-y-1" data-testid="reschedule-preview">
                        {resolved.pending ? (
                            <p className="text-muted">{t("common.loading")}</p>
                        ) : reschedulable.length === 0 ? (
                            <p className="text-amber-700">{t("orders.bulk.reschedule.nothing")}</p>
                        ) : (
                            <p className="font-medium">
                                {preview
                                    ? preview.replace("{count}", String(reschedulable.length))
                                    : `${reschedulable.length} ${t("orders.selected")}`}
                            </p>
                        )}
                        {skipped.length > 0 && !resolved.pending && (
                            <p className="text-muted">{t("orders.bulk.reschedule.skipped").replace("{count}", String(skipped.length))}</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={() => { if (day !== undefined) onConfirm(day); }}
                        disabled={!canConfirm}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                            canConfirm ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-sky-100 text-sky-300 cursor-not-allowed",
                        )}
                    >
                        {t("orders.bulk.reschedule.confirm").replace("{count}", String(reschedulable.length))}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
