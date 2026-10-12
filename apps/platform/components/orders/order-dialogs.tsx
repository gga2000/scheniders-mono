"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { withOrderModalBoundary } from "@/components/orders/order-modal-boundary";
import { compareTwinsFor } from "@/lib/duplicate-window";
import type { Order, OrderItem, MessageTemplate } from "@/lib/supabase";

const OrderDetailsModal = withOrderModalBoundary(
    "OrderDetailsModal",
    dynamic(
        () => import("@/components/orders/order-details-modal").then(mod => ({ default: mod.OrderDetailsModal })),
        { loading: () => null, ssr: false }
    )
);
const CreateOrderModal = withOrderModalBoundary(
    "CreateOrderModal",
    dynamic(
        () => import("@/components/orders/create-order-modal").then(mod => ({ default: mod.CreateOrderModal })),
        { loading: () => null, ssr: false }
    )
);
const ReturnsCockpitModal = withOrderModalBoundary(
    "ReturnsCockpitModal",
    dynamic(
        () => import("@/components/returns/returns-cockpit-modal").then(mod => ({ default: mod.ReturnsCockpitModal })),
        { loading: () => null, ssr: false }
    )
);
const BarcodeScanner = withOrderModalBoundary(
    "BarcodeScanner",
    dynamic(
        () => import("@/components/products/barcode-scanner").then(mod => ({ default: mod.BarcodeScanner })),
        { loading: () => null, ssr: false }
    )
);
const DuplicateComparisonModal = withOrderModalBoundary(
    "DuplicateComparisonModal",
    dynamic(
        () => import("@/components/orders/duplicate-comparison-modal").then(mod => ({ default: mod.DuplicateComparisonModal })),
        { loading: () => null, ssr: false }
    )
);
const SplitOrderDialog = withOrderModalBoundary(
    "SplitOrderDialog",
    dynamic(
        () => import("@/components/orders/split-order-dialog").then(mod => ({ default: mod.SplitOrderDialog })),
        { loading: () => null, ssr: false }
    )
);
const WhatsAppTemplatePanel = withOrderModalBoundary(
    "WhatsAppTemplatePanel",
    dynamic(
        () => import("@/components/orders/whatsapp-template-panel").then(mod => ({ default: mod.WhatsAppTemplatePanel })),
        { loading: () => null, ssr: false }
    )
);
const OrderConfirmationCard = dynamic(
    () => import("@/components/orders/order-confirmation-card").then(mod => ({ default: mod.OrderConfirmationCard })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const CancellationReasonDialog = withOrderModalBoundary(
    "CancellationReasonDialog",
    dynamic(
        () => import("@/components/orders/cancellation-reason-dialog").then(mod => ({ default: mod.CancellationReasonDialog })),
        { loading: () => null, ssr: false }
    )
);

interface OrderDialogsProps {
    /** Gates the two modals that must not render before hydration. */
    isMounted: boolean;
    isReturnsOpen: boolean;
    setIsReturnsOpen: (open: boolean) => void;
    isScannerOpen: boolean;
    setIsScannerOpen: (open: boolean) => void;
    workflowTemplates: MessageTemplate[];
    /** The rows currently on screen — what a bulk WhatsApp send applies to. */
    displayedOrders: Order[];
    onSplitConfirm: (keptItems: OrderItem[], returnedItems: OrderItem[]) => Promise<void>;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string, reasonId?: string) => Promise<unknown> | unknown;
}

/**
 * Every dialog that acts on ONE order: details, create, the duplicate
 * comparison, split, the WhatsApp panel, the confirmation screenshot, and the
 * cancel and reject reason prompts. The returns cockpit and the barcode scanner
 * ride along because they open an order rather than a selection.
 *
 * ARCH-1: these were inline in `page.tsx`. All of their open/subject state
 * already lived in the order store, so this reads it directly rather than
 * accepting it as props — the interface is the handful of things the page
 * genuinely owns.
 */
export function OrderDialogs({
    isMounted,
    isReturnsOpen,
    setIsReturnsOpen,
    isScannerOpen,
    setIsScannerOpen,
    workflowTemplates,
    displayedOrders,
    onSplitConfirm,
    onStatusUpdate,
}: OrderDialogsProps) {
    const {
        orders,
        updateOrder,
        updateOrderStatus,
        deleteOrder,
        createOrder,
        createReturnOrder,
        createReplacementOrder,
        mergeOrders,
        markAsVerifiedCustomer,
        getOrderTimeline,
        getOrderNotes,
        checkOrderIdExists,
        getCustomerOrders,
        dismissDuplicate,
        duplicateCandidates,
        getDuplicateWindowAlert,
        isBlacklisted,
        getBlacklistEntry,
    } = useOrdersContext();

    const {
        isModalOpen, setIsModalOpen,
        selectedOrder, setSelectedOrder,
        isCreateModalOpen, setIsCreateModalOpen,
        showDuplicateModal, setShowDuplicateModal,
        duplicateOrder, setDuplicateOrder,
        splitOrderDialog, setSplitOrderDialog,
        templatePanelOpen, setTemplatePanelOpen,
        orderForTemplate, setOrderForTemplate,
        screenshotOrder, setScreenshotOrder,
        cancelDialogOpen, setCancelDialogOpen,
        orderToCancel, setOrderToCancel,
        rejectDialogOpen, setRejectDialogOpen,
        orderToReject, setOrderToReject,
        selectedOrders,
        setFilterDuplicatesOnly,
    } = useOrderStore(
        useShallow((s) => ({
            isModalOpen: s.isModalOpen, setIsModalOpen: s.setIsModalOpen,
            selectedOrder: s.selectedOrder, setSelectedOrder: s.setSelectedOrder,
            isCreateModalOpen: s.isCreateModalOpen, setIsCreateModalOpen: s.setIsCreateModalOpen,
            showDuplicateModal: s.showDuplicateModal, setShowDuplicateModal: s.setShowDuplicateModal,
            duplicateOrder: s.duplicateOrder, setDuplicateOrder: s.setDuplicateOrder,
            splitOrderDialog: s.splitOrderDialog, setSplitOrderDialog: s.setSplitOrderDialog,
            templatePanelOpen: s.templatePanelOpen, setTemplatePanelOpen: s.setTemplatePanelOpen,
            orderForTemplate: s.orderForTemplate, setOrderForTemplate: s.setOrderForTemplate,
            screenshotOrder: s.screenshotOrder, setScreenshotOrder: s.setScreenshotOrder,
            cancelDialogOpen: s.cancelDialogOpen, setCancelDialogOpen: s.setCancelDialogOpen,
            orderToCancel: s.orderToCancel, setOrderToCancel: s.setOrderToCancel,
            rejectDialogOpen: s.rejectDialogOpen, setRejectDialogOpen: s.setRejectDialogOpen,
            orderToReject: s.orderToReject, setOrderToReject: s.setOrderToReject,
            selectedOrders: s.selectedOrders,
            setFilterDuplicatesOnly: s.setFilterDuplicatesOnly,
        })),
    );

    const compareTwins = duplicateOrder
        ? compareTwinsFor(duplicateOrder, duplicateCandidates, getDuplicateWindowAlert(duplicateOrder.id))
        : [];

    return (
        <>
            {/*
                Merge, do not replace. `selectedOrder` is the full row fetched by
                handleViewDetails; the list row carries fewer columns but fresher
                values, so layering it on top keeps both. Replacing dropped fields
                the list view never selects — scheduled_date, is_replacement,
                delivered_at, refund_status and others — and wasted the full fetch.
            */}
            <OrderDetailsModal
                order={selectedOrder
                    ? { ...selectedOrder, ...(orders.find((o: Order) => o.id === selectedOrder.id) ?? {}) }
                    : null}
                open={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedOrder(null);
                }}
                onUpdate={updateOrder}
                onStatusUpdate={updateOrderStatus}
                onGetTimeline={getOrderTimeline}
                onGetNotes={getOrderNotes}
                onDelete={deleteOrder}
                onCreateReturn={createReturnOrder}
                onCreateReplacement={createReplacementOrder}
                checkOrderIdExists={checkOrderIdExists}
                onOpenTemplatePanel={(o) => {
                    setOrderForTemplate(o);
                    setTemplatePanelOpen(true);
                }}
                messageTemplates={workflowTemplates}
            />
            <CreateOrderModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreate={createOrder}
                checkOrderIdExists={checkOrderIdExists}
                getBlacklistEntry={getBlacklistEntry}
            />

            {isMounted && (
                <ReturnsCockpitModal
                    open={isReturnsOpen}
                    onClose={() => setIsReturnsOpen(false)}
                    onOpenOrder={(order) => {
                        setSelectedOrder(order);
                        setIsModalOpen(true);
                        setIsReturnsOpen(false);
                    }}
                />
            )}

            {isMounted && (
                <BarcodeScanner
                    isOpen={isScannerOpen}
                    onClose={() => setIsScannerOpen(false)}
                    onScan={(code) => {
                        // Push the scanned code into the search; GlobalSearchField will
                        // normalize "QR:{id}|PHONE:..." → order id before applying.
                        useOrderStore.getState().setLocalSearchQuery(code);
                        setIsScannerOpen(false);
                    }}
                />
            )}

            {/* Duplicate Comparison Modal */}
            {
                duplicateOrder && (
                    <DuplicateComparisonModal
                        open={showDuplicateModal}
                        onClose={() => {
                            setShowDuplicateModal(false);
                            setDuplicateOrder(null);
                        }}
                        currentOrder={duplicateOrder}
                        duplicateOrders={compareTwins}
                        onMerge={async (targetId, sourceId) => {
                            const result = await mergeOrders(targetId, sourceId);
                            return result;
                        }}
                        onMarkAsSameCustomer={(orderId) => {
                            // Mark this customer as verified returning customer
                            markAsVerifiedCustomer(orderId);
                            setShowDuplicateModal(false);
                            setDuplicateOrder(null);
                        }}
                        onCancelOrder={async (orderId) => {
                            const result = await updateOrderStatus(orderId, "cancelled", "Cancelled via duplicate comparison");
                            return result;
                        }}
                        onViewOrder={(order) => {
                            setShowDuplicateModal(false);
                            setDuplicateOrder(null);
                            setSelectedOrder(order);
                            setIsModalOpen(true);
                        }}
                        onDismissDuplicate={async (_phone, notes) => {
                            // Dismiss exactly the orders on screen, not every
                            // order the number has ever placed.
                            await dismissDuplicate([duplicateOrder.id, ...compareTwins.map(o => o.id)], notes);
                        }}
                        onFilterDuplicates={() => {
                            setFilterDuplicatesOnly(true);
                        }}
                        isBlacklisted={isBlacklisted}
                        getCustomerOrders={getCustomerOrders}
                    />
                )
            }

            {/* Split Order Dialog */}
            {splitOrderDialog.open && splitOrderDialog.order && (
                <SplitOrderDialog
                    order={splitOrderDialog.order}
                    open={splitOrderDialog.open}
                    onClose={() => setSplitOrderDialog({ open: false, order: null })}
                    onConfirm={onSplitConfirm}
                />
            )}

            {/* WhatsApp Template Panel */}
            {(orderForTemplate || (templatePanelOpen && selectedOrders.size > 0)) && (
                <WhatsAppTemplatePanel
                    open={templatePanelOpen}
                    onClose={() => {
                        setTemplatePanelOpen(false);
                        setOrderForTemplate(null);
                    }}
                    order={orderForTemplate || undefined}
                    bulkOrders={!orderForTemplate ? displayedOrders.filter(o => selectedOrders.has(o.id)) : undefined}
                    templates={workflowTemplates}
                />
            )}


            {/* Order Confirmation Screenshot Modal */}
            <AnimatePresence>
                {screenshotOrder && (
                    <OrderConfirmationCard
                        order={screenshotOrder}
                        onClose={() => setScreenshotOrder(null)}
                    />
                )}
            </AnimatePresence>

            {/* Cancellation Reason Dialog */}
            <CancellationReasonDialog
                open={cancelDialogOpen}
                onClose={() => {
                    setCancelDialogOpen(false);
                    setOrderToCancel(null);
                }}
                onConfirm={async (reason, reasonId) => {
                    if (orderToCancel) {
                        await onStatusUpdate(orderToCancel.id, "cancelled", reason, reasonId);
                    }
                }}
                customerName={orderToCancel?.customer_name}
                orderId={orderToCancel?.sequence_number ? String(orderToCancel.sequence_number) : orderToCancel?.order_id}
                type="cancel"
            />

            {/* Rejection Reason Dialog */}
            <CancellationReasonDialog
                open={rejectDialogOpen}
                onClose={() => {
                    setRejectDialogOpen(false);
                    setOrderToReject(null);
                }}
                onConfirm={async (reason, reasonId) => {
                    if (orderToReject) {
                        await onStatusUpdate(orderToReject.id, "rejected", reason, reasonId);
                    }
                }}
                customerName={orderToReject?.customer_name}
                orderId={orderToReject?.sequence_number ? String(orderToReject.sequence_number) : orderToReject?.order_id}
                type="reject"
            />

        </>
    );
}
