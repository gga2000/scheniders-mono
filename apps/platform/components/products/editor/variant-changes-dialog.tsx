"use client";

import { useEffect } from "react";
import { AlertTriangle, Plus, Minus, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { VariantDiff } from "@/hooks/use-product-editor";
import type { VariantFormData } from "@/hooks/use-product-editor";

interface VariantChangesDialogProps {
    diff: VariantDiff;
    onConfirm: () => void;
    onCancel: () => void;
}

function VariantChip({ variant, type }: { variant: VariantFormData; type: "added" | "removed" | "unchanged" }) {
    const colorMap = {
        added: "bg-emerald-50 border-emerald-200 text-emerald-800",
        removed: "bg-rose-50 border-rose-200 text-rose-800",
        unchanged: "bg-[var(--background)] border-[var(--card-border)] text-muted",
    };
    const iconMap = {
        added: <Plus className="w-3 h-3 text-emerald-600" />,
        removed: <Minus className="w-3 h-3 text-rose-600" />,
        unchanged: <Check className="w-3 h-3 text-muted" />,
    };

    return (
        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium", colorMap[type])}>
            {iconMap[type]}
            <span>{variant.name}</span>
            {type === "removed" && variant.stock_quantity > 0 && (
                <span className="text-[10px] bg-rose-200 text-rose-700 px-1 py-0.5 rounded ml-1">
                    stock: {variant.stock_quantity}
                </span>
            )}
            {type === "removed" && variant.sku && (
                <span className="text-[10px] text-rose-500 ml-1">
                    {variant.sku}
                </span>
            )}
        </div>
    );
}

export function VariantChangesDialog({ diff, onConfirm, onCancel }: VariantChangesDialogProps) {
    const { t } = useLanguage();

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onCancel]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={t("products.variants.changes") || "Variant Changes"}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2 }}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                        <h3 className="text-lg font-bold text-foreground">
                            {t("products.variants.changes") || "Variant Changes"}
                        </h3>
                        <button
                            onClick={onCancel}
                            className="p-1.5 rounded-lg hover:bg-[var(--background)] transition-colors"
                        >
                            <X className="w-4 h-4 text-muted" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
                        {/* Added */}
                        {diff.added.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <Plus className="w-3 h-3 text-emerald-600" />
                                    </div>
                                    <p className="text-sm font-medium text-emerald-700">
                                        {(t("products.variants.willBeAdded") || "{count} variants will be added").replace("{count}", String(diff.added.length))}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pl-7">
                                    {diff.added.map((v, i) => (
                                        <VariantChip key={`add-${i}`} variant={v} type="added" />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Removed */}
                        {diff.removed.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center">
                                        <Minus className="w-3 h-3 text-rose-600" />
                                    </div>
                                    <p className="text-sm font-medium text-rose-700">
                                        {(t("products.variants.willBeRemoved") || "{count} variants will be removed").replace("{count}", String(diff.removed.length))}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pl-7">
                                    {diff.removed.map((v, i) => (
                                        <VariantChip key={`rm-${i}`} variant={v} type="removed" />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Unchanged */}
                        {diff.unchanged.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-[var(--background)] flex items-center justify-center border border-[var(--card-border)]">
                                        <Check className="w-3 h-3 text-muted" />
                                    </div>
                                    <p className="text-sm text-muted">
                                        {(t("products.variants.unchanged") || "{count} variants unchanged").replace("{count}", String(diff.unchanged.length))}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Stock at risk warning */}
                        {diff.hasStockAtRisk && (
                            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-amber-800">
                                        {diff.stockAtRiskCount} {t("products.variants.stockWarning") || "variants with stock will be removed. Stock will be lost."}
                                    </p>
                                    <p className="text-xs text-amber-600 mt-1">
                                        {diff.removed
                                            .filter(v => v.stock_quantity > 0)
                                            .map(v => `${v.name} (${v.stock_quantity})`)
                                            .join(", ")}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--card-border)] bg-[var(--background)]">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors rounded-lg hover:bg-[var(--card-bg)]"
                        >
                            {t("products.variants.cancel") || "Cancel"}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={cn(
                                "px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                                diff.hasStockAtRisk
                                    ? "bg-rose-500 text-white hover:bg-rose-600"
                                    : "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
                            )}
                        >
                            {t("products.variants.applyChanges") || "Apply Changes"}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
    );
}
