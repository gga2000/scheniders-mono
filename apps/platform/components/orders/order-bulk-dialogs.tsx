"use client";

import { AnimatePresence, motion } from "framer-motion";
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


            {/* Bulk Processing Overlay */}
            <AnimatePresence>
                {isBulkProcessing && (
                    <motion.div
                        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
                        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/20 pointer-events-none"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white/90 dark:bg-black/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 dark:border-white/10 flex flex-col items-center gap-6"
                        >
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                                <div className="relative bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                                    <svg className="w-10 h-10 text-blue-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    {t("orders.processing") !== "orders.processing" ? t("orders.processing") : "Processing..."}
                                </h3>
                                <p className="text-sm font-medium text-muted-foreground">
                                    Please wait while we update your orders
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


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
                            <ul className="space-y-2">
                                {Array.from(selectedOrders).map(id => {
                                    const order = orders.find(o => o.id === id);
                                    return order ? (
                                        <li key={id} className="text-sm text-rose-900 flex justify-between items-center bg-white/50 p-2 rounded-lg border border-rose-100/50">
                                            <span className="font-medium truncate max-w-[200px]">{order.customer_name}</span>
                                            <span className="text-rose-600 font-mono text-xs font-bold px-2 py-0.5 bg-rose-100 rounded-md">#{getBaseOrderId(order.order_id)}</span>
                                        </li>
                                    ) : null;
                                })}
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
