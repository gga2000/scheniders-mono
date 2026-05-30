"use client";

// Centered overlay that lets the user re-categorize one or many selected
// products. Opened via the `C` keyboard shortcut from the keyboard-shortcuts
// provider. Delegates selection UI to <CategoryCombobox variant="anchored" />
// and — when N > 1 — confirmation to <BulkCategoryConfirmDialog />.

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { CategoryCombobox } from "@/components/products/category-combobox";
import { BulkCategoryConfirmDialog } from "@/components/products/bulk-category-confirm-dialog";
import {
    useProductsQuery,
    useUpdateProductMutation,
} from "@/hooks/use-products-query";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useLanguage } from "@/hooks/use-language";

export interface CategorySwitcherOverlayProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedIds: string[];
}

export function CategorySwitcherOverlay({
    open,
    onOpenChange,
    selectedIds,
}: CategorySwitcherOverlayProps) {
    const { t } = useLanguage();
    const { data: products = [] } = useProductsQuery();
    const { data: categories = [] } = useCategoriesQuery();
    const updateMutation = useUpdateProductMutation();

    // When the bulk confirm dialog is mid-action we suppress backdrop/escape
    // close of *this* overlay so the dialog owns dismissal.
    const [bulkState, setBulkState] = useState<{
        open: boolean;
        targetCategoryId: string | null;
        targetCategoryName: string;
    } | null>(null);

    const count = selectedIds.length;

    const previewNames = useMemo(() => {
        if (products.length === 0 || selectedIds.length === 0) return [] as string[];
        const idSet = new Set(selectedIds);
        const names: string[] = [];
        for (const p of products) {
            if (idSet.has(p.id)) {
                names.push(p.name);
                if (names.length >= 5) break;
            }
        }
        return names;
    }, [products, selectedIds]);

    const close = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    const handleCategoryPick = useCallback(
        async (categoryId: string | null) => {
            if (selectedIds.length === 0) {
                close();
                return;
            }

            const targetName =
                categoryId === null
                    ? t("products.category.uncategorized") || "Uncategorized"
                    : categories.find((c) => c.id === categoryId)?.name ?? "";

            if (selectedIds.length === 1) {
                const id = selectedIds[0];
                try {
                    await updateMutation.mutateAsync({
                        id,
                        data: { category_id: categoryId },
                    });
                    toast.success(
                        t("products.bulkCategory.success", {
                            count: 1,
                            targetName,
                        }) || `Moved 1 product to "${targetName}"`
                    );
                } catch {
                    toast.error(
                        t("products.bulkCategory.error") || "Failed to move products"
                    );
                }
                close();
                return;
            }

            // N > 1 — hand off to the bulk confirm dialog.
            setBulkState({
                open: true,
                targetCategoryId: categoryId,
                targetCategoryName: targetName,
            });
        },
        [selectedIds, categories, updateMutation, t, close]
    );

    // Escape handling: close this overlay only if the bulk dialog is not open.
    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                if (bulkState?.open) return; // dialog handles its own escape
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        }
        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [open, bulkState?.open, close]);

    // The combobox's `onOpenChange(false)` fires on outside click / escape —
    // use that as a signal to close the whole overlay when no dialog is open.
    const handleComboboxOpenChange = useCallback(
        (next: boolean) => {
            if (!next && !bulkState?.open) {
                close();
            }
        },
        [bulkState?.open, close]
    );

    return (
        <>
            <AnimatePresence>
                {open && !bulkState?.open && (
                    <motion.div
                        key="category-switcher"
                        className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        {/* Backdrop */}
                        <motion.div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={close}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        />

                        {/* Panel */}
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            className="relative w-full max-w-md"
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                        >
                            <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                                {t("products.category.moveNProducts", { count }) ||
                                    `Move ${count} product(s) to:`}
                            </div>
                            <CategoryCombobox
                                variant="anchored"
                                open
                                onOpenChange={handleComboboxOpenChange}
                                value={null}
                                onChange={(id) => void handleCategoryPick(id)}
                                autoFocus
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {bulkState && (
                <BulkCategoryConfirmDialog
                    open={bulkState.open}
                    onOpenChange={(next) => {
                        setBulkState((prev) =>
                            prev ? { ...prev, open: next } : prev
                        );
                        if (!next) {
                            // Whether user confirmed or cancelled, collapse the whole flow.
                            setBulkState(null);
                            close();
                        }
                    }}
                    productIds={selectedIds}
                    targetCategoryId={bulkState.targetCategoryId}
                    targetCategoryName={bulkState.targetCategoryName}
                    previewNames={previewNames}
                />
            )}
        </>
    );
}

export default CategorySwitcherOverlay;
