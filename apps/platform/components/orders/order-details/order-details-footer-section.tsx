"use client";

import { DialogFooter } from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import { MessageCircle, Save, X, Trash2, AlertTriangle, Scissors, Send } from "lucide-react";
import type { OrderDetailsView } from "./use-order-details-model";
import { PrimeEditReview } from "./prime-edit-review";

/** One section of OrderDetailsModal. */
export function OrderDetailsFooterSection({ m }: { m: OrderDetailsView }) {
    const { onClose, onDelete, order, isSendingTemplate, t, isEditing, isSaving, handleCancel, primeEdit, formData, showDeleteConfirm, deleteCountdown, isDeleting, handleDeleteClick, handleDeleteConfirm, handleCancelDelete, setShowSplitDialog, handleWhatsApp, handleSendTemplate } = m;
    return (
        <>
            <DialogFooter>
                <div className="w-full flex flex-col gap-4">
                    {/* Delete Confirmation Warning */}
                    {showDeleteConfirm && (
                        <div className="w-full p-4 rounded-xl bg-rose-50 border-2 border-rose-200 animate-in slide-in-from-bottom-2">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-rose-900">{t("orderDetail.deleteOrderTitle")}</h4>
                                    <p className="text-sm text-rose-700">
                                        {t("orderDetail.deleteOrderMsg").replace("{id}", order.order_id)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCancelDelete}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 font-medium hover:bg-rose-50 transition-all"
                                >
                                    {t("orderDetail.cancel")}
                                </button>
                                <button
                                    onClick={handleDeleteConfirm}
                                    disabled={deleteCountdown > 0 || isDeleting}
                                    className={cn(
                                        "flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
                                        deleteCountdown > 0
                                            ? "bg-rose-200 text-rose-400 cursor-not-allowed"
                                            : "bg-rose-600 text-white hover:bg-rose-700"
                                    )}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {deleteCountdown > 0 ? t("orderDetail.waitDelete").replace("{n}", String(deleteCountdown)) : isDeleting ? t("orderDetail.deleting") : t("orderDetail.permanentDelete")}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Saving an edit Prime will get: what changes at Prime first */}
                    {!showDeleteConfirm && primeEdit.review && primeEdit.view && (
                        <PrimeEditReview
                            review={primeEdit.review}
                            view={primeEdit.view}
                            city={(formData.city ?? order.city ?? "") as string}
                            isSaving={isSaving}
                            onSave={primeEdit.confirm}
                            onBack={primeEdit.back}
                        />
                    )}

                    {/* Normal Footer Buttons */}
                    {!showDeleteConfirm && !primeEdit.review && (
                        <div className="flex gap-2 w-full">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleCancel}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium"
                                    >
                                        <X className="h-4 w-4" />
                                        {t("orderDetail.cancel")}
                                    </button>
                                    <button
                                        onClick={primeEdit.requestSave}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20 disabled:opacity-50 ml-auto"
                                    >
                                        <Save className="h-4 w-4" />
                                        {t("orderDetail.saveChanges")}
                                    </button>
                                </>
                            ) : (
                                <>
                                    {/* Split Order Button (Only for multi-item confirmed/in_transit orders) */}
                                    {(order.status === "confirmed" || order.status === "in_transit" || order.status === "delivered") &&
                                        !order.is_return &&
                                        order.items && order.items.length > 1 && (
                                            <button
                                                onClick={() => setShowSplitDialog(true)}
                                                className="flex items-center gap-2 px-3 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all font-medium"
                                                title={t("orders.tip.splitOrder")}
                                            >
                                                <Scissors className="h-4 w-4" />
                                            </button>
                                        )}

                                    {/* Delete Button */}
                                    {onDelete && !showDeleteConfirm && (
                                        <button
                                            onClick={handleDeleteClick}
                                            className="flex items-center gap-2 px-3 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all font-medium"
                                            title={t("orderDetail.deleteOrder")}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={onClose}
                                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium ml-auto"
                                    >
                                        {t("orderDetail.close")}
                                    </button>
                                    <button
                                        onClick={handleSendTemplate}
                                        disabled={isSendingTemplate || order.status !== "new"}
                                        className={cn(
                                            "flex items-center gap-2 px-6 py-3 rounded-xl text-white transition-all font-semibold shadow-md",
                                            order.status !== "new"
                                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                                : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                                        )}
                                        title={t("orderDetail.sendConfirmTooltip")}
                                    >
                                        {isSendingTemplate ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                        {t("orderDetail.sendConfirmTemplate")}
                                    </button>
                                    <button
                                        onClick={handleWhatsApp}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        {t("orderDetail.openWhatsApp")}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </DialogFooter>
        </>
    );
}
