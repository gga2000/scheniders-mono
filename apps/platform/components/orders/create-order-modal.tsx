"use client";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { formatIQD } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Package, Save, X, FileText, AlertTriangle, RefreshCw, Ban } from "lucide-react";
import { ProductPicker } from "./product-picker";
import { BulkUploadModal } from "./bulk-upload-modal";
import { useCreateOrderModel, type CreateOrderModalProps } from "./create-order/use-create-order-model";
import { CreateOrderDetailsSection } from "./create-order/create-order-details-section";
import { CreateOrderCustomerSection } from "./create-order/create-order-customer-section";
import { CreateOrderProductsSection } from "./create-order/create-order-products-section";
export type { CreateOrderModalInitialData } from "./create-order/use-create-order-model";

export function CreateOrderModal(props: CreateOrderModalProps) {
    const m = useCreateOrderModel(props);
    const { open, onCreate, t, limitWarning, limitBlocked, setOrderType, formData, setFormData, isCreating, stockWarning, showProductPicker, setShowProductPicker, showBulkUpload, setShowBulkUpload, createAndNew, setCreateAndNew, handleClose, updateField, handleProductSelect, handleClearFields, handleCreate, total } = m;

    return (
        <>
            <Dialog open={open} onOpenChange={() => { if (!showProductPicker) handleClose(); }} modal={!showProductPicker}>
                <DialogContent className="max-w-2xl bg-white border border-[var(--card-border)] !rounded-2xl overflow-hidden p-0 create-order-modal">
                    {/* Header */}
                    <DialogHeader className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--background)]">
                        <DialogTitle className="flex items-center justify-between text-foreground">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                    <Package className="h-4 w-4 text-green-700" />
                                </div>
                                <div>
                                    <span className="text-lg font-bold">{t("orders.create.title")}</span>
                                    <p className="text-xs font-normal text-muted mt-0.5">{t("orders.create.subtitle")}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleClearFields}
                                    className="px-2 py-1 flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-all opacity-70 hover:opacity-100"
                                    title={t("orders.create.clearAllTip")}
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    {t("orders.create.clear")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOrderType("delivery");
                                        setFormData(prev => ({
                                            ...prev,
                                            customer_name: "علي-تيست",
                                            phone: "07801234567",
                                            secondary_phone: "07811262261",
                                            city: "واسط",
                                            address_details: "العزيزية - الجمعية",
                                            source: "tiktok",
                                            is_test: true,
                                            items: prev.items.length > 0 ? prev.items : [{ name: "Test Product", price: 15000, quantity: 1 }]
                                        }));

                                        }}
                                        className="px-2 py-1 flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-all opacity-50 hover:opacity-100 shadow-sm"
                                        title={t("orders.create.fillTestTip")}
                                    >
                                        Test
                                    </button>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
                        {/* Plan Limit Block */}
                        {limitBlocked && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                                <Ban className="w-5 h-5 text-red-500 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-red-800">{t("orders.create.blocked")}</p>
                                    <p className="text-xs text-red-600">{limitBlocked}</p>
                                </div>
                            </div>
                        )}
                        {/* Plan Limit Warning */}
                        {limitWarning && !limitBlocked && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <p className="text-xs text-amber-700">{limitWarning}</p>
                            </div>
                        )}
                        <CreateOrderDetailsSection m={m} />

                        <CreateOrderCustomerSection m={m} />

                        <CreateOrderProductsSection m={m} />

                        {/* Notes — Compact Two-Column */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 px-1">
                                    <FileText className="h-3 w-3 text-amber-500" />
                                    <span className="text-[11px] font-semibold text-amber-700">{t("orders.create.orderNotes")}</span>
                                    <span className="text-[11px] text-amber-400">{t("orders.create.onInvoice")}</span>
                                </div>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => updateField("notes", e.target.value)}
                                    placeholder={t("orders.create.orderNotesPlaceholder")}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 px-1">
                                    <FileText className="h-3 w-3 text-blue-500" />
                                    <span className="text-[11px] font-semibold text-blue-700">{t("orders.create.internalNotes")}</span>
                                    <span className="text-[11px] text-blue-400">{t("orders.create.staffOnly")}</span>
                                </div>
                                <textarea
                                    value={formData.internal_notes || ""}
                                    onChange={(e) => updateField("internal_notes", e.target.value)}
                                    placeholder={t("orders.create.internalNotesPlaceholder")}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-blue-50/40 border border-blue-200/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {stockWarning && (
                        <div role="alert" className="mx-6 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            <p className="font-bold">{t("orders.create.lowStock")}</p>
                            <ul className="mt-1 space-y-0.5">
                                {stockWarning.shortfalls.map(s => (
                                    <li key={s.key}>
                                        {s.name}{s.isOpenBox ? ` (${t("orders.create.openBox")})` : ""}: {t("orders.create.needs", { count: s.need })}{" "}
                                        {s.left < 0 ? t("orders.create.oversold", { count: Math.abs(s.left) }) : t("orders.create.onlyLeft", { count: s.left })}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Sticky Footer */}
                    <DialogFooter className="sticky bottom-0 z-10 flex items-center justify-between gap-3 px-6 py-3 bg-[var(--background)] border-t border-[var(--card-border)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isCreating}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            <X className="h-4 w-4" />
                            {t("common.cancel")}
                        </button>

                        {/* Live Total */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50/80 rounded-lg border border-green-100">
                            <span className="text-[11px] text-green-600">{t("orders.create.total")}</span>
                            <span className="text-sm font-mono font-bold text-green-700">{formatIQD(total)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Create & New */}
                            <button
                                type="button"
                                onClick={() => { setCreateAndNew(true); handleCreate(); }}
                                disabled={isCreating || !!limitBlocked}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all disabled:opacity-50"
                            >
                                {isCreating && createAndNew ? (
                                    <div className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-500 rounded-full animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                {t("orders.create.createAndNew")}
                            </button>

                            {/* Create */}
                            <button
                                type="button"
                                onClick={() => handleCreate()}
                                disabled={isCreating || !!limitBlocked}
                                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] rounded-xl shadow-md transition-all disabled:opacity-50"
                            >
                                {isCreating && !createAndNew ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {t("orders.create.create")}
                            </button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Product Picker */}
            <ProductPicker
                open={showProductPicker}
                onClose={() => setShowProductPicker(false)}
                onSelect={handleProductSelect}
            />

            {/* Bulk Upload Modal */}
            <BulkUploadModal
                open={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                onCreate={async (orders) => {
                    let successCount = 0;
                    let failCount = 0;

                    // Create all orders with per-order error handling
                    for (const orderData of orders) {
                        try {
                            const result = await onCreate({
                                customer_name: orderData.customer_name,
                                phone: orderData.phone,
                                secondary_phone: orderData.secondary_phone || undefined,
                                city: orderData.city,
                                address_details: orderData.address,
                                items: [],
                                notes: '',
                                internal_notes: `[AI رفع مجمع] تم استخراج البيانات تلقائياً`,
                                price: 0,
                                discount_amount: 0,
                                delivery_fee: 0,
                                is_shop_order: false,
                                // ARCH-3: this was 'pending', which is not an
                                // OrderStatus. OrderSchema validates status against
                                // the enum, so every order this path created was
                                // rejected with a validation error — the bulk image
                                // upload could not create anything. Surfaced only
                                // once `onCreate` stopped being typed `any`.
                                status: 'new',
                                source: 'whatsapp',
                                priority: 'normal',
                                payment_status: 'cod',
                                is_return: false,
                                is_replacement: false,
                                is_archived: false,
                                order_id: '',
                            });
                            
                            if (result?.success) {
                                successCount++;
                            } else {
                                failCount++;
                                console.error(`Failed to create order for ${orderData.customer_name}:`, result?.error);
                            }
                        } catch (err) {
                            failCount++;
                            console.error(`Error creating order for ${orderData.customer_name}:`, err);
                        }
                    }
                    
                    if (failCount === 0) {
                        toast.success(t("orders.create.bulkDone", { count: successCount }));
                    } else if (successCount > 0) {
                        toast.warning(t("orders.create.bulkPartial", { ok: successCount, failed: failCount }));
                    } else {
                        toast.error(t("orders.create.bulkFailed", { count: failCount }));
                    }
                }}
            />
        </>
    );
}
