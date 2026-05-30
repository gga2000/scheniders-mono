// Right-side slide-in panel for quickly assigning multiple products to a category.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, Search, Package } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { BulkCategoryConfirmDialog } from "@/components/products/bulk-category-confirm-dialog";
import { cn, formatIQD } from "@/lib/utils";

export interface CategoryQuickAssignPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;

    targetCategoryId: string | null;
    targetCategoryName: string;

    products: Array<{
        id: string;
        name: string;
        image_url?: string | null;
        category_id?: string | null;
        stock_quantity?: number;
        price?: number;
    }>;
}

type TabKey = "uncategorized" | "other" | "all";

const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT = 68;

export function CategoryQuickAssignPanel({
    open,
    onOpenChange,
    targetCategoryId,
    targetCategoryName,
    products,
}: CategoryQuickAssignPanelProps) {
    const { t, language } = useLanguage();
    const isRtl = language === "ar";

    const { data: categories = [] } = useCategoriesQuery();
    const categoryById = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of categories) map.set(c.id, c.name);
        return map;
    }, [categories]);

    const [activeTab, setActiveTab] = useState<TabKey>("uncategorized");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    useEffect(() => {
        if (!open) {
            setSearch("");
            setSelected(new Set());
            setActiveTab("uncategorized");
        }
    }, [open]);

    const availableProducts = useMemo(
        () => products.filter((p) => (p.category_id ?? null) !== targetCategoryId),
        [products, targetCategoryId]
    );

    const counts = useMemo(() => {
        let uncategorized = 0;
        let other = 0;
        for (const p of availableProducts) {
            const cid = p.category_id ?? null;
            if (cid === null) uncategorized++;
            else other++;
        }
        return { uncategorized, other, all: availableProducts.length };
    }, [availableProducts]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return availableProducts.filter((p) => {
            const cid = p.category_id ?? null;
            if (activeTab === "uncategorized" && cid !== null) return false;
            if (activeTab === "other" && cid === null) return false;
            if (q && !p.name.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [availableProducts, activeTab, search]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD;
    const rowVirtualizer = useVirtualizer({
        count: filtered.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
        enabled: shouldVirtualize,
    });

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const clearLocal = () => setSelected(new Set());

    const selectedCount = selected.size;
    const selectedIds = useMemo(() => Array.from(selected), [selected]);
    const previewNames = useMemo(() => {
        const names: string[] = [];
        for (const p of products) {
            if (selected.has(p.id)) names.push(p.name);
            if (names.length >= 5) break;
        }
        return names;
    }, [products, selected]);

    const renderRow = (p: (typeof products)[number]) => {
        const isChecked = selected.has(p.id);
        const currentCatName = p.category_id ? categoryById.get(p.category_id) ?? null : null;
        return (
            <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-start",
                    isChecked
                        ? "bg-[var(--pastel-yellow)]/40 border-[var(--card-border)]"
                        : "bg-transparent border-transparent hover:bg-[var(--background)]"
                )}
                style={{ height: ROW_HEIGHT - 8 }}
            >
                <span
                    className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        isChecked
                            ? "bg-[var(--foreground)] border-[var(--foreground)]"
                            : "border-[var(--card-border)]"
                    )}
                    aria-hidden
                >
                    {isChecked && (
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-[var(--background)]">
                            <path
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 8.5l3 3 7-7"
                            />
                        </svg>
                    )}
                </span>
                <div className="w-12 h-12 rounded-lg bg-[var(--background)] border border-[var(--card-border)] overflow-hidden shrink-0 flex items-center justify-center">
                    {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <Package className="w-5 h-5 text-muted" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                    <div className="text-xs text-muted truncate">
                        {currentCatName ?? t("products.quickAssign.tabUncategorized")}
                    </div>
                </div>
                {typeof p.price === "number" && (
                    <div className="text-xs font-semibold text-foreground shrink-0">
                        {formatIQD(p.price)}
                    </div>
                )}
            </button>
        );
    };

    const tabs: Array<{ key: TabKey; label: string; count: number }> = [
        {
            key: "uncategorized",
            label: t("products.quickAssign.tabUncategorized"),
            count: counts.uncategorized,
        },
        {
            key: "other",
            label: t("products.quickAssign.tabOtherCategories"),
            count: counts.other,
        },
        { key: "all", label: t("products.quickAssign.tabAll"), count: counts.all },
    ];

    const offscreen = isRtl ? "-100%" : "100%";

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-[90]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <motion.div
                            className="absolute inset-0 bg-black/30"
                            onClick={() => onOpenChange(false)}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        />

                        <motion.aside
                            role="dialog"
                            aria-modal="true"
                            className={cn(
                                "absolute top-0 bottom-0 h-full w-full sm:w-[420px]",
                                "bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl",
                                "flex flex-col",
                                isRtl
                                    ? "left-0 rounded-r-2xl"
                                    : "right-0 rounded-l-2xl"
                            )}
                            initial={{ x: offscreen }}
                            animate={{ x: 0 }}
                            exit={{ x: offscreen }}
                            transition={{ type: "spring", damping: 28, stiffness: 240 }}
                        >
                            <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--card-border)]">
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-base font-semibold text-foreground truncate">
                                        {t("products.quickAssign.title", {
                                            targetName: targetCategoryName,
                                        })}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4 text-muted" />
                                </button>
                            </div>

                            <div className="px-5 py-3 border-b border-[var(--card-border)] space-y-3">
                                <div className="relative">
                                    <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted pointer-events-none" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder={t("products.quickAssign.searchPlaceholder")}
                                        className="w-full ps-9 pe-3 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>

                                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                                    {tabs.map((tab) => {
                                        const isActive = activeTab === tab.key;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setActiveTab(tab.key)}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors",
                                                    isActive
                                                        ? "bg-[var(--pastel-yellow)] text-foreground font-semibold"
                                                        : "text-muted hover:text-foreground bg-[var(--background)]"
                                                )}
                                            >
                                                <span>{tab.label}</span>
                                                <span
                                                    className={cn(
                                                        "text-[10px] px-1.5 py-0.5 rounded-md",
                                                        isActive
                                                            ? "bg-[var(--card-bg)] text-foreground"
                                                            : "bg-[var(--card-bg)] text-muted"
                                                    )}
                                                >
                                                    {tab.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2">
                                {filtered.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-sm text-muted px-4 text-center">
                                        {t("products.quickAssign.empty")}
                                    </div>
                                ) : shouldVirtualize ? (
                                    <div
                                        style={{
                                            height: rowVirtualizer.getTotalSize(),
                                            position: "relative",
                                            width: "100%",
                                        }}
                                    >
                                        {rowVirtualizer.getVirtualItems().map((v) => {
                                            const p = filtered[v.index];
                                            return (
                                                <div
                                                    key={p.id}
                                                    style={{
                                                        position: "absolute",
                                                        top: 0,
                                                        insetInlineStart: 0,
                                                        width: "100%",
                                                        height: v.size,
                                                        transform: `translateY(${v.start}px)`,
                                                    }}
                                                >
                                                    {renderRow(p)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {filtered.map((p) => renderRow(p))}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--card-border)] bg-[var(--background)]/40">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm text-foreground font-medium">
                                        {t("products.quickAssign.selectedCount", {
                                            n: selectedCount,
                                        })}
                                    </span>
                                    {selectedCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearLocal}
                                            className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
                                        >
                                            {t("products.quickAssign.clearSelection")}
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    disabled={selectedCount === 0}
                                    onClick={() => setConfirmOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed truncate"
                                >
                                    {t("products.quickAssign.assignButton", {
                                        n: selectedCount,
                                        targetName: targetCategoryName,
                                    })}
                                </button>
                            </div>
                        </motion.aside>
                    </motion.div>
                )}
            </AnimatePresence>

            <BulkCategoryConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                productIds={selectedIds}
                targetCategoryId={targetCategoryId}
                targetCategoryName={targetCategoryName}
                previewNames={previewNames}
                onConfirmed={() => {
                    clearLocal();
                    onOpenChange(false);
                }}
            />
        </>
    );
}
