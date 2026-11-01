"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Archive,
    ChevronDown,
    Download,
    FolderInput,
    Loader2,
    Minus,
    Plus,
    Target,
    X,
} from "lucide-react";
import type { Product } from "@/lib/supabase";
import type { Category } from "@/types/product";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { exportSuppliesToCsv } from "@/lib/utils/supply-csv-export";
import { useLanguage } from "@/hooks/use-language";

type PopoverKind = null | "reorder" | "category" | "adjust";

type SupplyPatch = {
    reorder_point?: number | null;
    category_id?: string | null;
    is_archived?: boolean;
};

interface SuppliesBulkActionsBarProps {
    selected: Product[];
    categories: Category[];
    onClear: () => void;
    updateProduct: (id: string, patch: SupplyPatch) => Promise<void>;
    /** Adds or removes units on the current stock (never an absolute write). */
    adjustStock: (id: string, delta: number) => Promise<unknown>;
}

export function SuppliesBulkActionsBar({
    selected,
    categories,
    onClear,
    updateProduct,
    adjustStock,
}: SuppliesBulkActionsBarProps) {
    const { t } = useLanguage();
    const [openPopover, setOpenPopover] = useState<PopoverKind>(null);
    const [busy, setBusy] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!openPopover) return;
        const handler = (e: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) setOpenPopover(null);
        };
        window.addEventListener("mousedown", handler);
        return () => window.removeEventListener("mousedown", handler);
    }, [openPopover]);

    const selectedCount = selected.length;

    const runPatch = (patchFor: (supply: Product) => SupplyPatch, successLabel: string) =>
        runBulk((supply) => updateProduct(supply.id, patchFor(supply)), successLabel);

    const runBulk = async (
        writeFor: (supply: Product) => Promise<unknown> | null,
        successLabel: string,
    ) => {
        if (busy || selectedCount === 0) return;
        setBusy(true);
        try {
            const results = await Promise.allSettled(
                selected.map((supply) => writeFor(supply) ?? Promise.resolve()),
            );
            let ok = 0;
            let fail = 0;
            for (const r of results) {
                if (r.status === "fulfilled") ok++;
                else fail++;
            }
            if (fail === 0) {
                toast.success(successLabel, ok === 1 ? t("supplies.bulk.suppliesUpdatedOne") : t("supplies.bulk.suppliesUpdated", { count: ok }));
            } else if (ok === 0) {
                toast.error(t("supplies.bulk.failed", { label: successLabel }), t("supplies.bulk.allFailed", { count: fail }));
            } else {
                toast.error(t("supplies.bulk.partial", { label: successLabel }), t("supplies.bulk.partialDetail", { ok, fail }));
            }
            if (ok > 0) {
                setOpenPopover(null);
                onClear();
            }
        } finally {
            setBusy(false);
        }
    };

    const handleExport = () => {
        if (selectedCount === 0) return;
        exportSuppliesToCsv(selected);
        toast.success(t("supplies.bulk.csvExported"), selectedCount === 1 ? t("supplies.bulk.selectedSupplyOne") : t("supplies.bulk.selectedSupplies", { count: selectedCount }));
    };

    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    ref={containerRef}
                    key="supplies-bulk-bar"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                        "fixed z-40 bottom-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2",
                        "pb-[env(safe-area-inset-bottom)]",
                    )}
                >
                    <div
                        className={cn(
                            "flex flex-wrap items-center gap-1.5 md:gap-2 px-3 py-2 rounded-2xl",
                            "bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl",
                            "backdrop-blur-sm",
                        )}
                    >
                        <div className="flex items-center gap-2 pl-1 pr-2 border-r border-[var(--card-border)]">
                            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-teal-500 text-white text-[11px] font-semibold tabular-nums">
                                {selectedCount}
                            </span>
                            <span className="text-sm text-foreground font-medium">{t("supplies.bulk.selected")}</span>
                            <button
                                type="button"
                                onClick={onClear}
                                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                title={t("supplies.bulk.clearSelection")}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <PopoverButton
                            icon={<Target className="w-3.5 h-3.5" />}
                            label={t("supplies.bulk.reorderPoint")}
                            open={openPopover === "reorder"}
                            onToggle={() =>
                                setOpenPopover((p) => (p === "reorder" ? null : "reorder"))
                            }
                        >
                            <ReorderPointForm
                                busy={busy}
                                onSubmit={(value) =>
                                    runPatch(() => ({ reorder_point: value }), t("supplies.bulk.reorderPointSet"))
                                }
                            />
                        </PopoverButton>

                        <PopoverButton
                            icon={<FolderInput className="w-3.5 h-3.5" />}
                            label={t("supplies.bulk.category")}
                            open={openPopover === "category"}
                            onToggle={() =>
                                setOpenPopover((p) => (p === "category" ? null : "category"))
                            }
                        >
                            <CategoryForm
                                busy={busy}
                                categories={categories}
                                onSubmit={(categoryId) =>
                                    runPatch(
                                        () => ({ category_id: categoryId }),
                                        t("supplies.bulk.categoryUpdated"),
                                    )
                                }
                            />
                        </PopoverButton>

                        <PopoverButton
                            icon={<Plus className="w-3.5 h-3.5" />}
                            label={t("supplies.bulk.adjustStock")}
                            open={openPopover === "adjust"}
                            onToggle={() =>
                                setOpenPopover((p) => (p === "adjust" ? null : "adjust"))
                            }
                        >
                            <AdjustStockForm
                                busy={busy}
                                onSubmit={(delta) =>
                                    runBulk(
                                        (supply) => (delta === 0 ? null : adjustStock(supply.id, delta)),
                                        t("supplies.bulk.stockAdjusted"),
                                    )
                                }
                            />
                        </PopoverButton>

                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={busy}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                                "bg-[var(--background)] border border-[var(--card-border)] text-foreground",
                                "hover:bg-white hover:border-teal-200 hover:text-teal-700",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                            title={t("supplies.bulk.export")}
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t("supplies.bulk.exportCsv")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                runPatch(() => ({ is_archived: true }), t("supplies.bulk.archived"))
                            }
                            disabled={busy}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                                "bg-[var(--background)] border border-[var(--card-border)] text-foreground",
                                "hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                            title={t("supplies.bulk.archiveSelected")}
                        >
                            {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Archive className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden sm:inline">{t("supplies.bulk.archive")}</span>
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

interface PopoverButtonProps {
    icon: React.ReactNode;
    label: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function PopoverButton({ icon, label, open, onToggle, children }: PopoverButtonProps) {
    return (
        <div className="relative">
            <button
                type="button"
                onClick={onToggle}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                    open
                        ? "bg-teal-500 text-white border border-teal-500"
                        : "bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-white hover:border-teal-200 hover:text-teal-700",
                )}
            >
                {icon}
                <span className="hidden sm:inline">{label}</span>
                <ChevronDown
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.12 }}
                        className={cn(
                            "absolute bottom-full mb-2 left-0 min-w-[240px] p-3 rounded-xl",
                            "bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl",
                        )}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ReorderPointForm({
    busy,
    onSubmit,
}: {
    busy: boolean;
    onSubmit: (value: number) => void;
}) {
    const { t } = useLanguage();
    const [raw, setRaw] = useState("");
    const parsed = Number(raw);
    const valid = raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!valid || busy) return;
                onSubmit(Math.round(parsed));
            }}
            className="flex flex-col gap-2"
        >
            <label className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                {t("supplies.bulk.setReorderPoint")}
            </label>
            <input
                type="number"
                inputMode="numeric"
                min={0}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                autoFocus
                placeholder={t("supplies.bulk.placeholderPoint")}
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
            />
            <button
                type="submit"
                disabled={!valid || busy}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("supplies.bulk.apply")}
            </button>
        </form>
    );
}

function CategoryForm({
    busy,
    categories,
    onSubmit,
}: {
    busy: boolean;
    categories: Category[];
    onSubmit: (categoryId: string | null) => void;
}) {
    const { t } = useLanguage();
    const [value, setValue] = useState<string>("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                onSubmit(value === "__none__" ? null : value || null);
            }}
            className="flex flex-col gap-2"
        >
            <label className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                {t("supplies.bulk.setCategory")}
            </label>
            <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
            >
                <option value="">{t("supplies.bulk.selectCategory")}</option>
                <option value="__none__">{t("supplies.bulk.uncategorized")}</option>
                {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
            <button
                type="submit"
                disabled={busy || value === ""}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("supplies.bulk.apply")}
            </button>
        </form>
    );
}

function AdjustStockForm({
    busy,
    onSubmit,
}: {
    busy: boolean;
    onSubmit: (delta: number) => void;
}) {
    const { t } = useLanguage();
    const [raw, setRaw] = useState("");
    const parsed = Number(raw);
    const valid = raw.trim() !== "" && Number.isFinite(parsed) && parsed !== 0;
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!valid || busy) return;
                onSubmit(Math.trunc(parsed));
            }}
            className="flex flex-col gap-2"
        >
            <label className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                {t("supplies.bulk.adjustBy")}
            </label>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        const current = Number(raw);
                        const next = Number.isFinite(current) ? current - 1 : -1;
                        setRaw(String(next));
                    }}
                    className="p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                    title={t("supplies.bulk.stepMinus")}
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                    type="number"
                    inputMode="numeric"
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    autoFocus
                    placeholder={t("supplies.bulk.placeholderDelta")}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
                <button
                    type="button"
                    onClick={() => {
                        const current = Number(raw);
                        const next = Number.isFinite(current) ? current + 1 : 1;
                        setRaw(String(next));
                    }}
                    className="p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                    title={t("supplies.bulk.stepPlus")}
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
            <p className="text-[11px] text-muted">
                {t("supplies.bulk.adjustHint")}
            </p>
            <button
                type="submit"
                disabled={!valid || busy}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("supplies.bulk.apply")}
            </button>
        </form>
    );
}
