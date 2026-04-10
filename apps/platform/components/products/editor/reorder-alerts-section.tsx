"use client";

import { Bell, AlertTriangle, CheckCircle } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface ReorderAlertsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function ReorderAlertsSection({ formData, updateField }: ReorderAlertsSectionProps) {
    const reorderPoint = formData.reorder_point;
    const hasReorderPoint = reorderPoint !== null && reorderPoint > 0;
    const isAtOrBelowReorder = hasReorderPoint && formData.stock_quantity <= reorderPoint;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Reorder Alerts
            </h2>

            {/* Reorder point input */}
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    Reorder Point
                </label>
                <input
                    type="number"
                    value={reorderPoint ?? ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        updateField("reorder_point", val === "" ? null : parseInt(val) || 0);
                    }}
                    placeholder="e.g. 10"
                    min={0}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                />
                <p className="text-xs text-muted mt-1.5">
                    When stock drops to this level, you'll be prompted to reorder.
                </p>
            </div>

            {/* Alert states */}
            {hasReorderPoint && isAtOrBelowReorder && (
                <div className="p-4 bg-[var(--pastel-yellow)] rounded-xl border border-yellow-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-yellow-900">Reorder Suggested</p>
                        <p className="text-sm text-yellow-800 mt-0.5">
                            Stock is at or below reorder point ({formData.stock_quantity} / {reorderPoint}). Consider placing a new order with your supplier.
                        </p>
                    </div>
                </div>
            )}

            {hasReorderPoint && !isAtOrBelowReorder && (
                <div className="p-4 bg-[var(--pastel-green)] rounded-xl border border-green-200 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-green-800">
                            Stock levels are healthy ({formData.stock_quantity} units, reorder point: {reorderPoint}).
                        </p>
                    </div>
                </div>
            )}

            {!hasReorderPoint && (
                <p className="text-sm text-muted py-2">
                    Set a reorder point to receive alerts when stock is low.
                </p>
            )}
        </div>
    );
}
