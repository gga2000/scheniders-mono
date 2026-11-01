// Modal that scans uncategorized products and proposes batch category assignments
// via fuzzy name matching against existing category names (fuse.js, no ML).
"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Fuse from "fuse.js";
import { X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { BulkCategoryConfirmDialog } from "@/components/products/bulk-category-confirm-dialog";

// =============================================
// TYPES
// =============================================

export interface CategorySuggesterProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;

    // All products in memory. The suggester filters to uncategorized itself.
    products: Array<{ id: string; name: string; category_id?: string | null }>;

    // All categories in memory.
    categories: Array<{ id: string; name: string; parent_id?: string | null }>;
}

interface Bucket {
    categoryId: string;
    categoryName: string;
    products: Array<{ id: string; name: string }>;
}

// =============================================
// CONSTANTS
// =============================================

// Fuse's own threshold is a "don't-include" cutoff. We set it to 0.4 as
// specified, then post-filter the best score at <= 0.35 for the "strong match"
// grouping. This gives us a slightly wider candidate pool from Fuse but still
// assigns conservatively.
const FUSE_THRESHOLD = 0.4;
const STRONG_MATCH_MAX_SCORE = 0.35;
const MAX_REVIEW_ITEMS = 10;

// =============================================
// COMPONENT
// =============================================

export function CategorySuggester({
    open,
    onOpenChange,
    products,
    categories,
}: CategorySuggesterProps) {
    const { t } = useLanguage();

    // Local snapshot of bucket ids we've "resolved" (assigned) so they
    // disappear without re-running the whole scan.
    const [resolvedCategoryIds, setResolvedCategoryIds] = useState<Set<string>>(
        new Set()
    );
    const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(
        new Set()
    );
    const [confirmBucket, setConfirmBucket] = useState<Bucket | null>(null);

    // =============================================
    // FILTER + INDEX
    // =============================================

    const uncategorised = useMemo(
        () => products.filter((p) => p.category_id == null),
        [products]
    );

    const fuse = useMemo(
        () =>
            new Fuse(categories, {
                keys: ["name"],
                threshold: FUSE_THRESHOLD,
                includeScore: true,
            }),
        [categories]
    );

    // =============================================
    // BUCKETING
    // =============================================

    const { strongBuckets, noMatchCount } = useMemo(() => {
        const byCategory = new Map<string, Bucket>();
        let noMatches = 0;

        for (const product of uncategorised) {
            const results = fuse.search(product.name);
            const best = results[0];

            if (
                best &&
                typeof best.score === "number" &&
                best.score <= STRONG_MATCH_MAX_SCORE
            ) {
                const cat = best.item;
                const existing = byCategory.get(cat.id);
                if (existing) {
                    existing.products.push({ id: product.id, name: product.name });
                } else {
                    byCategory.set(cat.id, {
                        categoryId: cat.id,
                        categoryName: cat.name,
                        products: [{ id: product.id, name: product.name }],
                    });
                }
            } else {
                noMatches++;
            }
        }

        const buckets = Array.from(byCategory.values())
            .filter((b) => b.products.length > 0)
            .filter((b) => !resolvedCategoryIds.has(b.categoryId))
            .sort((a, b) => b.products.length - a.products.length);

        return { strongBuckets: buckets, noMatchCount: noMatches };
    }, [uncategorised, fuse, resolvedCategoryIds]);

    // =============================================
    // HANDLERS
    // =============================================

    const toggleExpanded = (categoryId: string) => {
        setExpandedBuckets((prev) => {
            const next = new Set(prev);
            if (next.has(categoryId)) next.delete(categoryId);
            else next.add(categoryId);
            return next;
        });
    };

    const handleAssignAll = (bucket: Bucket) => {
        setConfirmBucket(bucket);
    };

    const handleConfirmed = () => {
        if (!confirmBucket) return;
        setResolvedCategoryIds((prev) => {
            const next = new Set(prev);
            next.add(confirmBucket.categoryId);
            return next;
        });
        setConfirmBucket(null);
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    // =============================================
    // RENDER
    // =============================================

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") handleClose();
                        }}
                    >
                        {/* Backdrop */}
                        <motion.div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={handleClose}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        />

                        {/* Panel */}
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            className="relative w-full max-w-[640px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                        >
                            {/* Header */}
                            <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
                                <div className="w-9 h-9 rounded-xl bg-[var(--background)] flex items-center justify-center shrink-0">
                                    <Sparkles className="w-5 h-5 text-[var(--foreground)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-base font-semibold text-[var(--foreground)]">
                                        {t("products.suggester.title") || "Suggest categories"}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-muted">
                                        {t("products.suggester.subtitle", {
                                            count: uncategorised.length,
                                        }) ||
                                            `Found ${uncategorised.length} uncategorized products`}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    aria-label={t("common.close")}
                                    className="shrink-0 p-1.5 rounded-lg text-muted hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto overscroll-contain p-3">
                                {uncategorised.length === 0 && (
                                    <div className="px-4 py-10 text-center text-sm text-muted">
                                        {t("products.suggester.empty") ||
                                            "No uncategorized products"}
                                    </div>
                                )}

                                {uncategorised.length > 0 &&
                                    strongBuckets.length === 0 &&
                                    noMatchCount === 0 && (
                                        <div className="px-4 py-10 text-center text-sm text-muted">
                                            {t("products.suggester.empty") ||
                                                "No uncategorized products"}
                                        </div>
                                    )}

                                <ul className="space-y-2">
                                    {strongBuckets.map((bucket) => {
                                        const isExpanded = expandedBuckets.has(
                                            bucket.categoryId
                                        );
                                        const shown = bucket.products.slice(
                                            0,
                                            MAX_REVIEW_ITEMS
                                        );
                                        const hidden =
                                            bucket.products.length - shown.length;

                                        return (
                                            <li
                                                key={bucket.categoryId}
                                                className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 overflow-hidden"
                                            >
                                                <div className="flex items-center gap-3 px-3 py-2.5">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-[var(--pastel-yellow)]/40 text-xs font-semibold text-[var(--foreground)]">
                                                            {bucket.products.length}
                                                        </span>
                                                        <span className="text-sm font-medium text-[var(--foreground)] truncate">
                                                            {bucket.categoryName}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleExpanded(bucket.categoryId)
                                                        }
                                                        className={cn(
                                                            "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                                                        )}
                                                    >
                                                        <span>
                                                            {t("products.suggester.review") ||
                                                                "Review"}
                                                        </span>
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-3 h-3" />
                                                        ) : (
                                                            <ChevronDown className="w-3 h-3" />
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleAssignAll(bucket)}
                                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity"
                                                    >
                                                        {t("products.suggester.assignAll") ||
                                                            "Assign all"}
                                                    </button>
                                                </div>

                                                <AnimatePresence initial={false}>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.15 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <ul className="px-4 pb-3 pt-1 space-y-1 text-xs text-muted border-t border-[var(--card-border)]">
                                                                {shown.map((p) => (
                                                                    <li
                                                                        key={p.id}
                                                                        className="truncate"
                                                                    >
                                                                        • {p.name}
                                                                    </li>
                                                                ))}
                                                                {hidden > 0 && (
                                                                    <li className="truncate italic">
                                                                        {t(
                                                                            "products.suggester.andMore",
                                                                            { n: hidden }
                                                                        ) || `…and ${hidden} more`}
                                                                    </li>
                                                                )}
                                                            </ul>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </li>
                                        );
                                    })}
                                </ul>

                                {noMatchCount > 0 && (
                                    <div className="mt-3 px-3 py-2.5 text-xs text-muted italic text-center">
                                        {t("products.suggester.noStrongMatch", {
                                            count: noMatchCount,
                                        }) || `${noMatchCount} no strong match`}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {confirmBucket && (
                <BulkCategoryConfirmDialog
                    open={!!confirmBucket}
                    onOpenChange={(o) => {
                        if (!o) setConfirmBucket(null);
                    }}
                    productIds={confirmBucket.products.map((p) => p.id)}
                    targetCategoryId={confirmBucket.categoryId}
                    targetCategoryName={confirmBucket.categoryName}
                    previewNames={confirmBucket.products.map((p) => p.name)}
                    onConfirmed={handleConfirmed}
                />
            )}
        </>
    );
}
