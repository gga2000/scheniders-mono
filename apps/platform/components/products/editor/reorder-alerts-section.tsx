"use client";

import { useLanguage } from "@/hooks/use-language";
import { Bell, AlertTriangle, CheckCircle } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface ReorderAlertsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function ReorderAlertsSection({ formData, updateField }: ReorderAlertsSectionProps) {
    const { t } = useLanguage();
    const reorderPoint = formData.reorder_point;
    const hasReorderPoint = reorderPoint !== null && reorderPoint > 0;
    const isAtOrBelowReorder = hasReorderPoint && formData.stock_quantity <= reorderPoint;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4" />
                {t("products.ed.reorder.title")}
            </h2>

            {/* Reorder point input */}
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    {t("products.ed.reorder.point")}
                </label>
                <input
                    type="number"
                    value={reorderPoint ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        updateField("reorder_point", val === "" ? null : parseInt(val) || 0);
                    }}
                    placeholder={t("products.ed.reorder.placeholder")}
                    min={0}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                />
                <p className="text-xs text-muted mt-1.5">
                    {t("products.ed.reorder.hint")}
                </p>
            </div>

            {/* Alert states */}
            {hasReorderPoint && isAtOrBelowReorder && (
                <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{t("products.ed.reorder.suggested")}</p>
                        <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                            {t("products.ed.reorder.suggestedBody", { stock: formData.stock_quantity, point: reorderPoint ?? 0 })}
                        </p>
                    </div>
                </div>
            )}

            {hasReorderPoint && !isAtOrBelowReorder && (
                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-emerald-800 dark:text-emerald-300">
                            {t("products.ed.reorder.healthy", { stock: formData.stock_quantity, point: reorderPoint ?? 0 })}
                        </p>
                    </div>
                </div>
            )}

            {!hasReorderPoint && (
                <p className="text-sm text-muted py-2">
                    {t("products.ed.reorder.empty")}
                </p>
            )}
        </div>
    );
}
