"use client";

import { Dialog, DialogDescription, DialogHeader } from "@scheniders/ui/dialog";
import { OrderHistory } from "./order-history/order-history";
import { ProductPicker } from "./product-picker";
import { OrderCustomerCard } from "./order-customer-card";
import { OrderItemsEditor } from "./order-items-editor";
import { OrderNotes } from "./order-notes";
import { OrderAdProfit } from "./order-ad-profit";
import { SplitOrderDialog } from "./split-order-dialog";
import { CreateOrderModal } from "./create-order-modal";
import { XCircle } from "lucide-react";
import { BlacklistDialog } from "@/components/orders/blacklist-dialog";
import { useOrderDetailsModel, buildOrderDetailsActions, type OrderDetailsView, type OrderDetailsModalProps } from "./order-details/use-order-details-model";
import { OrderDetailsHeaderSection } from "./order-details/order-details-header-section";
import { OrderDetailsStatusSection } from "./order-details/order-details-status-section";
import { OrderDetailsFooterSection } from "./order-details/order-details-footer-section";

export function OrderDetailsModal(props: OrderDetailsModalProps) {
    const base = useOrderDetailsModel(props);
    const { order, onClose } = base;
    // IMPORTANT: Do NOT return null here — the <Dialog> must always render
    // so Radix can see `open` go from true → false and properly clean up
    // inert attributes / scroll locks on the body.  Otherwise, clicks on the
    // underlying page stop working until a full refresh.
    if (!order) {
        return (
            <Dialog open={false} onOpenChange={() => onClose()}>
                {null}
            </Dialog>
        );
    }
    const m: OrderDetailsView = { ...base, ...buildOrderDetailsActions(base, order), order };
    const { open, onStatusUpdate, checkOrderIdExists, isMobile, t, PromptComponent, recordContact, isEditing, formData, handleEdit, updateFormData, handleRemoveItem, handleUpdateItemQuantity, handleAddItem, handleProductSelect, showProductPicker, setShowProductPicker, orderDateError, getBlacklistEntry, addToBlacklist, removeFromBlacklist, blacklistDialogOpen, setBlacklistDialogOpen, blacklistDialogMode, activeTab, isUpdatingStatus, showSplitDialog, setShowSplitDialog, handleSplitOrder, handleStatusChange, showCreateOrderModal, setShowCreateOrderModal, orderInitialData, setOrderInitialData, createOrder, ContentWrapper } = m;

    return (
        <>
            <Dialog open={open && !showCreateOrderModal} onOpenChange={(isOpen) => { if (!showProductPicker) onClose(); }} modal={!showProductPicker}>
                <ContentWrapper
                    className={isMobile ? "" : "max-w-4xl"}
                    hideCloseButton={true}
                    {...(isMobile ? { onClose } : {})}
                >
                    {/* Header Area */}
                    <DialogHeader className="space-y-0 pb-0 group relative">
                        <OrderDetailsHeaderSection m={m} />

                        <OrderDetailsStatusSection m={m} />


                        <DialogDescription className="sr-only">
                            {t("orders.ui.detailsFor", { id: order.order_id })}
                        </DialogDescription>
                    </DialogHeader>

                    {activeTab === "timeline" && (
                        <div className="py-2">
                            <OrderHistory order={order} />
                        </div>
                    )}

                    {/* Details Content (default) */}
                    {activeTab === "details" && (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">

                            {/* Customer Info Card - Compact & Organized */}
                            <OrderCustomerCard
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                onStatusUpdate={onStatusUpdate}
                                isUpdatingStatus={isUpdatingStatus}
                                handleStatusChange={handleStatusChange}
                                orderDateError={orderDateError}
                                onRequestEdit={handleEdit}
                                onContactRecorded={recordContact}
                            />

                            {/* Products Card */}
                            <OrderItemsEditor
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                handleAddItem={handleAddItem}
                                handleUpdateItemQuantity={handleUpdateItemQuantity}
                                handleRemoveItem={handleRemoveItem}
                            />

                            {!isEditing && <OrderAdProfit order={order} />}

                            {/* Notes Cards */}
                            <OrderNotes
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                            />

                            {/* Rejection Reason */}
                            {
                                order.status === "rejected" && order.rejection_reason && (
                                    <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4">
                                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                                            <XCircle className="w-4 h-4 text-muted" />
                                            {t("orderDetail.rejectionReason")}
                                        </h4>
                                        <p className="text-sm text-muted">{order.rejection_reason}</p>
                                    </div>
                                )
                            }
                        </div>
                    )}

                    <OrderDetailsFooterSection m={m} />
                </ContentWrapper>
            </Dialog >

            {showSplitDialog && order && (
                <SplitOrderDialog
                    order={order}
                    open={showSplitDialog}
                    onClose={() => setShowSplitDialog(false)}
                    onConfirm={handleSplitOrder}
                />
            )}

            {/* Product Picker Modal - Outside Dialog for proper z-index */}
            < ProductPicker
                open={showProductPicker}
                onClose={() => setShowProductPicker(false)
                }
                onSelect={handleProductSelect}
            />

            {/* Create Order Modal for Reorder */}
            {showCreateOrderModal && (
                <CreateOrderModal
                    open={showCreateOrderModal}
                    onClose={() => {
                        setShowCreateOrderModal(false);
                        setOrderInitialData(null);
                    }}
                    onCreate={createOrder}
                    checkOrderIdExists={checkOrderIdExists}
                    initialData={orderInitialData ?? undefined}
                />
            )}

            {/* Dynamic async prompt dialog */}
            <PromptComponent />

            {/* Blacklist dialog */}
            {order && (
                <BlacklistDialog
                    open={blacklistDialogOpen}
                    onClose={() => setBlacklistDialogOpen(false)}
                    mode={blacklistDialogMode}
                    customerName={order.customer_name}
                    customerPhone={order.phone}
                    existingEntry={getBlacklistEntry(order.phone)}
                    onConfirm={async (reason, notes) => {
                        if (blacklistDialogMode === "add" && reason) {
                            await addToBlacklist(order.phone, reason, notes);
                        } else if (blacklistDialogMode === "remove") {
                            await removeFromBlacklist(order.phone);
                        }
                    }}
                />
            )}
        </>
    );
}
