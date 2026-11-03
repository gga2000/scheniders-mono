"use client";

import { useRef } from "react";
import { Package, AlertTriangle } from "lucide-react";
import { Switch } from "@scheniders/ui/switch";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";
import { parseStorefrontStock } from "@/lib/storefront-stock";
import { parseWholeNumber } from "@/lib/utils";

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

    // On = the store shows formData.storefront_stock; off = it follows real stock (column null).
    // The number is remembered while off so flipping back restores it.
    const customOn = formData.storefront_stock != null;
    const lastCustom = useRef<number | null>(null);
    if (formData.storefront_stock != null) lastCustom.current = formData.storefront_stock;
    const setCustom = (on: boolean) => {
        updateField("storefront_stock", on ? (lastCustom.current ?? Math.max(0, available)) : null);
    };

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
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.lowStock")}
                    </label>
                    <input
                        type="number"
                        value={formData.low_stock_threshold}
                        onChange={(e) => updateField("low_stock_threshold", parseWholeNumber(e.target.value) ?? 0)}
                        placeholder="5"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            {!formData.is_supply && (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <label htmlFor="storefront-stock-toggle" className="text-sm font-medium text-foreground">
                            {t("products.ed.storefrontStockToggle")}
                        </label>
                        <Switch
                            id="storefront-stock-toggle"
                            checked={customOn}
                            onCheckedChange={setCustom}
                        />
                    </div>
                    {customOn ? (
                        <div className="space-y-2">
                            <label htmlFor="storefront-stock" className="block text-sm font-medium text-foreground">
                                {t("products.ed.storefrontStock")}
                            </label>
                            <input
                                id="storefront-stock"
                                type="number"
                                inputMode="numeric"
                                value={formData.storefront_stock ?? 0}
                                onChange={(e) => {
                                    updateField("storefront_stock", parseStorefrontStock(e.target.value) ?? 0);
                                }}
                                min={0}
                                className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                            <p className="text-xs text-muted">{t("products.ed.storefrontStockOn")}</p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted">
                            {t("products.ed.storefrontStockOff", { count: Math.max(0, available) })}
                        </p>
                    )}
                </div>
            )}

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
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-500/15 dark:border-amber-500/30">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 dark:text-amber-300" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">{t("products.ed.lowStockNote").replace("{n}", String(available))}</p>
                </div>
            )}

            {isOutOfStock && (
                <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl dark:bg-rose-500/15 dark:border-rose-500/30">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 dark:text-rose-300" />
                    <p className="text-sm text-rose-700 dark:text-rose-300">{t("products.ed.outOfStockNote")}</p>
                </div>
            )}
        </div>
    );
}
