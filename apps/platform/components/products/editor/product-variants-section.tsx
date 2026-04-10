"use client";

import { Plus, Trash2, Layers } from "lucide-react";
import type { ProductEditorFormData, VariantFormData } from "@/hooks/use-product-editor";

interface ProductVariantsSectionProps {
    formData: ProductEditorFormData;
    addVariant: () => void;
    removeVariant: (index: number) => void;
    updateVariant: (index: number, field: keyof VariantFormData, value: string | number) => void;
}

export function ProductVariantsSection({ formData, addVariant, removeVariant, updateVariant }: ProductVariantsSectionProps) {
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Variants
                </h2>
                <button
                    type="button"
                    onClick={addVariant}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Variant
                </button>
            </div>

            {formData.variants.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Layers className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No variants added. Add variants for different sizes, colors, or options.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {formData.variants.map((variant, index) => (
                        <div
                            key={variant.id || index}
                            className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-foreground">
                                    Variant {index + 1}
                                    {variant.name && (
                                        <span className="text-muted ml-2">— {variant.name}</span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeVariant(index)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <label className="block text-xs text-muted mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={variant.name}
                                        onChange={(e) => updateVariant(index, "name", e.target.value)}
                                        placeholder="e.g., 50ml"
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">Price (IQD)</label>
                                    <input
                                        type="number"
                                        value={variant.price || ""}
                                        onChange={(e) => updateVariant(index, "price", parseFloat(e.target.value) || 0)}
                                        placeholder="Price"
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">Stock</label>
                                    <input
                                        type="number"
                                        value={variant.stock_quantity}
                                        onChange={(e) => updateVariant(index, "stock_quantity", parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">SKU</label>
                                    <input
                                        type="text"
                                        value={variant.sku}
                                        onChange={(e) => updateVariant(index, "sku", e.target.value)}
                                        placeholder="Optional"
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
