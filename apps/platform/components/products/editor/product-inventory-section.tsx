"use client";

import { useState } from "react";
import { Package, AlertTriangle } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface ProductInventorySectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    reservedQuantity?: number;
}

export function ProductInventorySection({ formData, updateField, reservedQuantity = 0 }: ProductInventorySectionProps) {
    const [trackInventory, setTrackInventory] = useState(true);
    const available = formData.stock_quantity - reservedQuantity;
    const isLowStock = available > 0 && available <= formData.low_stock_threshold;
    const isOutOfStock = available <= 0;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Inventory
                </h2>
                <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm text-muted">Track inventory</span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={trackInventory}
                        onClick={() => setTrackInventory(!trackInventory)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                            trackInventory ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                                trackInventory ? "translate-x-5" : "translate-x-0"
                            }`}
                        />
                    </button>
                </label>
            </div>

            {trackInventory && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Stock Quantity
                            </label>
                            <input
                                type="number"
                                value={formData.stock_quantity}
                                onChange={(e) => updateField("stock_quantity", parseInt(e.target.value) || 0)}
                                placeholder="0"
                                min={0}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Low Stock Alert Threshold
                            </label>
                            <input
                                type="number"
                                value={formData.low_stock_threshold}
                                onChange={(e) => updateField("low_stock_threshold", parseInt(e.target.value) || 5)}
                                placeholder="5"
                                min={0}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>
                    </div>

                    {/* Stock status indicators */}
                    {reservedQuantity > 0 && (
                        <div className="flex items-center gap-4 px-4 py-3 bg-[var(--pastel-blue)] rounded-xl">
                            <div className="text-sm">
                                <span className="text-blue-700 font-medium">Available: {available}</span>
                                <span className="text-blue-600 mx-2">|</span>
                                <span className="text-blue-600">Reserved: {reservedQuantity}</span>
                                <span className="text-blue-600 mx-2">|</span>
                                <span className="text-blue-600">Total: {formData.stock_quantity}</span>
                            </div>
                        </div>
                    )}

                    {isLowStock && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <p className="text-sm text-amber-700">
                                Low stock — only {available} units available
                            </p>
                        </div>
                    )}

                    {isOutOfStock && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <p className="text-sm text-rose-700">
                                Out of stock — no units available
                            </p>
                        </div>
                    )}
                </>
            )}

            {!trackInventory && (
                <p className="text-sm text-muted py-2">
                    Inventory tracking is disabled. This product will always show as in stock.
                </p>
            )}
        </div>
    );
}
