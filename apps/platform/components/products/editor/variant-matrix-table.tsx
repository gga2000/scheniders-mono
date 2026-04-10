"use client";

import { useState, useRef } from "react";
import { Grid3X3, Camera, Wand2, ChevronDown, Package } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { VariantFormData } from "@/hooks/use-product-editor";

// Extended variant with option values
export interface VariantRowData extends VariantFormData {
    option_values: Record<string, string>;
    image_url?: string;
    is_enabled: boolean;
}

interface VariantMatrixTableProps {
    variants: VariantRowData[];
    options: Array<{ name: string; values: string[] }>;
    onUpdateVariant: (index: number, updates: Partial<VariantRowData>) => void;
    onApplyToAll: (field: "price" | "cost" | "stock_quantity", value: number) => void;
    productSku?: string;
    productPrice: number;
    productCost: number;
}

const OPTION_BADGE_STYLES = [
    "bg-[var(--pastel-blue)] text-blue-800",
    "bg-[var(--pastel-pink)] text-pink-800",
    "bg-[var(--pastel-mint)] text-teal-800",
    "bg-[var(--pastel-yellow)] text-yellow-800",
    "bg-[var(--pastel-green)] text-green-800",
];

export function VariantMatrixTable({
    variants,
    options,
    onUpdateVariant,
    onApplyToAll,
    productSku,
    productPrice,
    productCost,
}: VariantMatrixTableProps) {
    const [showApplyAll, setShowApplyAll] = useState(false);
    const [applyAllPrice, setApplyAllPrice] = useState<number>(productPrice);
    const [applyAllCost, setApplyAllCost] = useState<number>(productCost);
    const [applyAllStock, setApplyAllStock] = useState<number>(0);
    const fileInputRefs = useRef<Record<number, HTMLInputElement>>({});

    const enabledVariants = variants.filter((v) => v.is_enabled);
    const totalStock = enabledVariants.reduce((sum, v) => sum + v.stock_quantity, 0);

    function generateSku(variant: VariantRowData): string {
        const base = productSku || "SKU";
        const optionParts = options.map((opt) => {
            const val = variant.option_values[opt.name] || "";
            return val.toUpperCase().replace(/\s+/g, "-");
        });
        return [base, ...optionParts].join("-");
    }

    function handleImageClick(index: number) {
        const input = fileInputRefs.current[index];
        if (input) {
            input.click();
        }
    }

    function handleImageChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            onUpdateVariant(index, { image_url: url });
        }
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                        <Grid3X3 className="w-4 h-4" />
                        Variant Matrix
                    </h2>
                    {variants.length > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--pastel-blue)] text-blue-800">
                            {variants.length} variant{variants.length !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                {variants.length > 0 && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowApplyAll(!showApplyAll)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                        >
                            Apply to All
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showApplyAll ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                            {showApplyAll && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-2 z-10 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg p-4 w-72 space-y-3"
                                >
                                    {/* Apply Price */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">Price</label>
                                        <input
                                            type="number"
                                            value={applyAllPrice || ""}
                                            onChange={(e) => setApplyAllPrice(parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            min={0}
                                            className="flex-1 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onApplyToAll("price", applyAllPrice);
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            Apply
                                        </button>
                                    </div>

                                    {/* Apply Cost */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">Cost</label>
                                        <input
                                            type="number"
                                            value={applyAllCost || ""}
                                            onChange={(e) => setApplyAllCost(parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            min={0}
                                            className="flex-1 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onApplyToAll("cost", applyAllCost);
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            Apply
                                        </button>
                                    </div>

                                    {/* Apply Stock */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">Stock</label>
                                        <input
                                            type="number"
                                            value={applyAllStock || ""}
                                            onChange={(e) => setApplyAllStock(parseInt(e.target.value) || 0)}
                                            placeholder="0"
                                            min={0}
                                            className="flex-1 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onApplyToAll("stock_quantity", applyAllStock);
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Empty state */}
            {variants.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Grid3X3 className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        Configure product options above to generate variant combinations.
                    </p>
                </div>
            ) : (
                <>
                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        On
                                    </th>
                                    {options.map((opt) => (
                                        <th
                                            key={opt.name}
                                            className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]"
                                        >
                                            {opt.name}
                                        </th>
                                    ))}
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        Price (IQD)
                                    </th>
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        Cost (IQD)
                                    </th>
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        Stock
                                    </th>
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        SKU
                                    </th>
                                    <th className="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 text-left bg-[var(--background)]">
                                        Image
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence initial={false}>
                                    {variants.map((variant, index) => (
                                        <motion.tr
                                            key={variant.id || `variant-${index}`}
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 8 }}
                                            transition={{ duration: 0.2 }}
                                            className={`border-b border-[var(--card-border)] hover:bg-[var(--background)]/50 transition-colors ${
                                                !variant.is_enabled ? "opacity-50" : ""
                                            }`}
                                        >
                                            {/* Enable toggle */}
                                            <td className="px-3 py-2.5">
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={variant.is_enabled}
                                                    onClick={() =>
                                                        onUpdateVariant(index, {
                                                            is_enabled: !variant.is_enabled,
                                                        })
                                                    }
                                                    className={`relative w-9 h-5 rounded-full transition-colors ${
                                                        variant.is_enabled
                                                            ? "bg-emerald-500"
                                                            : "bg-gray-300"
                                                    }`}
                                                >
                                                    <span
                                                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                                                            variant.is_enabled
                                                                ? "translate-x-4"
                                                                : ""
                                                        }`}
                                                    />
                                                </button>
                                            </td>

                                            {/* Option value cells */}
                                            {options.map((opt, optIndex) => (
                                                <td key={opt.name} className="px-3 py-2.5">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                            OPTION_BADGE_STYLES[
                                                                optIndex % OPTION_BADGE_STYLES.length
                                                            ]
                                                        }`}
                                                    >
                                                        {variant.option_values[opt.name] || "—"}
                                                    </span>
                                                </td>
                                            ))}

                                            {/* Price */}
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="number"
                                                    value={variant.price || ""}
                                                    onChange={(e) =>
                                                        onUpdateVariant(index, {
                                                            price:
                                                                parseFloat(e.target.value) || 0,
                                                        })
                                                    }
                                                    placeholder="0"
                                                    min={0}
                                                    className="w-24 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                            </td>

                                            {/* Cost */}
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="number"
                                                    value={variant.cost || ""}
                                                    onChange={(e) =>
                                                        onUpdateVariant(index, {
                                                            cost:
                                                                parseFloat(e.target.value) || 0,
                                                        })
                                                    }
                                                    placeholder="0"
                                                    min={0}
                                                    className="w-24 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                            </td>

                                            {/* Stock */}
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="number"
                                                    value={variant.stock_quantity || ""}
                                                    onChange={(e) =>
                                                        onUpdateVariant(index, {
                                                            stock_quantity:
                                                                parseInt(e.target.value) || 0,
                                                        })
                                                    }
                                                    placeholder="0"
                                                    min={0}
                                                    className="w-20 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-right text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                            </td>

                                            {/* SKU */}
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        value={variant.sku}
                                                        onChange={(e) =>
                                                            onUpdateVariant(index, {
                                                                sku: e.target.value,
                                                            })
                                                        }
                                                        placeholder="SKU"
                                                        className="w-28 px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-left text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                    />
                                                    <button
                                                        type="button"
                                                        title="Auto-generate SKU"
                                                        onClick={() =>
                                                            onUpdateVariant(index, {
                                                                sku: generateSku(variant),
                                                            })
                                                        }
                                                        className="p-1 text-muted hover:text-foreground hover:bg-[var(--background)] rounded transition-colors shrink-0"
                                                    >
                                                        <Wand2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Image */}
                                            <td className="px-3 py-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleImageClick(index)}
                                                    className="w-8 h-8 rounded-lg border border-[var(--card-border)] bg-[var(--background)] overflow-hidden flex items-center justify-center hover:border-[var(--foreground)]/30 transition-colors"
                                                >
                                                    {variant.image_url ? (
                                                        <img
                                                            src={variant.image_url}
                                                            alt={variant.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <Camera className="w-3.5 h-3.5 text-muted" />
                                                    )}
                                                </button>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    ref={(el) => {
                                                        if (el) {
                                                            fileInputRefs.current[index] = el;
                                                        }
                                                    }}
                                                    onChange={(e) => handleImageChange(index, e)}
                                                />
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>

                    {/* Summary footer */}
                    <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-[var(--background)] rounded-xl text-sm">
                        <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-muted" />
                            <span className="text-muted">Total variants:</span>
                            <span className="font-medium text-foreground">{variants.length}</span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">Enabled:</span>
                            <span className="font-medium text-emerald-600">{enabledVariants.length}</span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">Total stock:</span>
                            <span className="font-medium text-foreground">{totalStock.toLocaleString()}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
