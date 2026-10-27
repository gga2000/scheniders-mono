"use client";

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
    } = bulk;

    // Every selected order, including ones picked from a search (any date) or
    // left selected after the search was cleared: the window alone listed none
    // of those.
    const toDelete = useResolvedOrders(selectedOrders, [orders, filteredOrders], deleteConfirmOpen);

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
