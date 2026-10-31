// Modal confirmation dialog for bulk (N > 1) product-category moves.
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { FolderOpen, Loader2 } from "lucide-react";
import { productRepository } from "@/lib/repositories/product-repository";
import { productKeys } from "@/hooks/use-products-query";
import { useLanguage } from "@/hooks/use-language";

export interface BulkCategoryConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;

    productIds: string[];
    targetCategoryId: string | null;
    targetCategoryName: string;

    previewNames?: string[];

    onConfirmed?: () => void;
}

export function BulkCategoryConfirmDialog({
    open,
    onOpenChange,
    productIds,
    targetCategoryId,
    targetCategoryName,
    previewNames,
    onConfirmed,
}: BulkCategoryConfirmDialogProps) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const count = productIds.length;

    const handleCancel = () => {
        if (isSubmitting) return;
        onOpenChange(false);
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await productRepository.bulkUpdateCategory(productIds, targetCategoryId);
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
            toast.success(
                t("products.bulkCategory.success", { count, targetName: targetCategoryName }) ||
                `Moved ${count} products to "${targetCategoryName}"`
            );
            onConfirmed?.();
            onOpenChange(false);
        } catch {
            toast.error(t("products.bulkCategory.error") || "Failed to move products");
        } finally {
            setIsSubmitting(false);
        }
    };

    const shownNames = previewNames?.slice(0, 5) ?? [];
    const hiddenCount = previewNames && productIds.length > previewNames.length
        ? productIds.length - previewNames.length
        : 0;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCancel();
                    }}
                >
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={handleCancel}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Panel */}
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="relative w-full max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden"
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                        <div className="px-5 pt-5 pb-4">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--background)] flex items-center justify-center shrink-0">
                                    <FolderOpen className="w-5 h-5 text-[var(--foreground)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-base font-semibold text-[var(--foreground)]">
                                        {t("products.bulkCategory.confirmTitle", { count, targetName: targetCategoryName }) ||
                                            `Move ${count} products to "${targetCategoryName}"?`}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted">
                                        {t("products.bulkCategory.confirmBody") ||
                                            "The products will be removed from their current categories."}
                                    </p>
                                </div>
                            </div>

                            {shownNames.length > 0 && (
                                <ul className="mt-4 ms-12 space-y-1 text-xs text-muted">
                                    {shownNames.map((name, i) => (
                                        <li key={`${i}-${name}`} className="truncate">
                                            • {name}
                                        </li>
                                    ))}
                                    {hiddenCount > 0 && (
                                        <li className="truncate italic">
                                            {t("products.bulkCategory.andMore", { n: hiddenCount }) ||
                                                `…and ${hiddenCount} more`}
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--card-border)] bg-[var(--background)]/40">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium rounded-xl border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t("common.cancel") || "Cancel"}
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                <span>
                                    {t("products.bulkCategory.confirmButton", { count }) ||
                                        `Move ${count} products`}
                                </span>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
