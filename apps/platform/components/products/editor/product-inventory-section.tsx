"use client";

import { Package, AlertTriangle } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface ProductInventorySectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    reservedQuantity?: number;
}

export function ProductInventorySection({ formData, updateField, reservedQuantity = 0 }: ProductInventorySectionProps) {
    const { t } = useLanguage();
    const available = formData.stock_quantity - reservedQuantity;
    const isLowStock = available > 0 && available <= formData.low_stock_threshold;
    const isOutOfStock = available <= 0;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4" />
                {t("products.ed.inventory")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.stock")}
                    </label>
                    <input
                        type="number"
                        value={formData.stock_quantity}
                        onChange={(e) => updateField("stock_quantity", parseInt(e.target.value, 10) || 0)}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.lowStock")}
                    </label>
                    <input
                        type="number"
                        value={formData.low_stock_threshold}
                        onChange={(e) => updateField("low_stock_threshold", parseInt(e.target.value, 10) || 5)}
                        placeholder="5"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            {reservedQuantity > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-[var(--pastel-blue)] rounded-xl text-sm text-blue-700 tabular-nums">
                    <span className="font-medium">{t("products.ed.available").replace("{n}", String(available))}</span>
                    <span aria-hidden>·</span>
                    <span>{t("products.ed.reserved").replace("{n}", String(reservedQuantity))}</span>
                    <span aria-hidden>·</span>
                    <span>{t("products.ed.total").replace("{n}", String(formData.stock_quantity))}</span>
                </div>
            )}

            {isLowStock && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-700">{t("products.ed.lowStockNote").replace("{n}", String(available))}</p>
                </div>
            )}

            {isOutOfStock && (
                <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <p className="text-sm text-rose-700">{t("products.ed.outOfStockNote")}</p>
                </div>
            )}
        </div>
    );
}
