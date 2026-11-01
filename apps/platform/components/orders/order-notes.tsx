"use client";

import { useLanguage } from "@/hooks/use-language";
import { FileText } from "lucide-react";
import type { Order } from "@/types/order";

type NotesKey = "notes" | "internal_notes";

interface OrderNotesProps {
    isEditing: boolean;
    order: Order;
    formData: Partial<Order>;
    updateFormData: (key: string, value: unknown) => void;
}

export function OrderNotes({
    isEditing,
    order,
    formData,
    updateFormData
}: OrderNotesProps) {
    const { t } = useLanguage();

    const displayValue = (key: NotesKey): string => {
        if (isEditing && formData[key] !== undefined) {
            return formData[key] ?? "";
        }
        return order[key] ?? "";
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 order-detail-notes">
            {/* Order Notes - Shown on invoice */}
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <div>
                        <span className="font-semibold text-amber-900">{t("orderDetail.orderNotes")}</span>
                        <span className="text-xs text-amber-600 mr-2">{t("orderDetail.invoiceNote")}</span>
                    </div>
                </div>
                <div className="p-4">
                    {isEditing ? (
                        <textarea
                            value={displayValue("notes")}
                            onChange={(e) => updateFormData("notes", e.target.value)}
                            placeholder={t("orderDetail.orderNotesPlaceholder")}
                            rows={2}
                            className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                        />
                    ) : (
                        <p className="text-sm text-amber-800 min-h-[40px]">
                            {order.notes || <span className="text-muted italic">{t("orderDetail.noNotes")}</span>}
                        </p>
                    )}
                </div>
            </div>

            {/* Internal Notes - Employees only, NOT on invoice */}
            <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-200">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <div>
                        <span className="font-semibold text-blue-900">{t("orderDetail.internalNotes")}</span>
                        <span className="text-xs text-blue-600 mr-2">{t("orderDetail.employeesOnly")}</span>
                    </div>
                </div>
                <div className="p-4">
                    {isEditing ? (
                        <textarea
                            value={displayValue("internal_notes")}
                            onChange={(e) => updateFormData("internal_notes", e.target.value)}
                            placeholder={t("orderDetail.internalNotesPlaceholder")}
                            rows={2}
                            className="w-full px-3 py-2 bg-blue-50/50 border border-blue-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                        />
                    ) : (
                        <p className="text-sm text-blue-800 min-h-[40px]">
                            {order.internal_notes || <span className="text-muted italic">{t("orderDetail.noInternalNotes")}</span>}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
