"use client";

import { DollarSign, TrendingUp, Percent } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface ProductPricingSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    profitMargin: number | null;
    profitAmount: number | null;
    discountPercentage: number | null;
}

export function ProductPricingSection({
    formData,
    updateField,
    profitMargin,
    profitAmount,
    discountPercentage,
}: ProductPricingSectionProps) {
    const { t } = useLanguage();
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {formData.is_supply ? t("products.ed.costPricing") : t("products.ed.pricing")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {!formData.is_supply && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("products.ed.price")} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="number"
                                value={formData.price || ""}
                                onChange={(e) => updateField("price", parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                min={0}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("products.ed.compareAt")}
                                <span className="text-xs text-muted block">{t("products.ed.compareAtHint")}</span>
                            </label>
                            <input
                                type="number"
                                value={formData.compare_at_price || ""}
                                onChange={(e) => updateField("compare_at_price", parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                min={0}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.cost")}
                        {formData.is_supply && <span className="text-rose-500 ms-1">*</span>}
                    </label>
                    <input
                        type="number"
                        value={formData.cost || ""}
                        onChange={(e) => updateField("cost", parseInt(e.target.value, 10) || 0)}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            {/* Profit & Discount indicators */}
            {!formData.is_supply && (profitMargin !== null || discountPercentage !== null) && (
                <div className="flex flex-row items-center gap-2">
                    {profitMargin !== null && profitAmount !== null && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--pastel-green)] rounded-xl">
                            <TrendingUp className="w-3.5 h-3.5 text-green-700" />
                            <span className="text-sm font-bold text-green-900">{profitMargin.toFixed(1)}%</span>
                            <span className="text-xs text-green-700">{t("products.ed.perUnit").replace("{amount}", profitAmount.toLocaleString())}</span>
                        </div>
                    )}
                    {discountPercentage !== null && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--pastel-pink)] rounded-xl">
                            <Percent className="w-3.5 h-3.5 text-rose-700" />
                            <span className="text-sm font-bold text-rose-900">{discountPercentage}%</span>
                            <span className="text-xs text-rose-700">
                                {t("products.ed.saveAmount").replace("{amount}", (formData.compare_at_price - formData.price).toLocaleString())}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
