"use client";

import type React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, Maximize2, Package, PackageX, Plus } from "lucide-react";
import { GlobalSearchField } from "@/components/orders/global-search-field";
import { EASE_CHROME } from "@/components/layout/page-transition";
import { useLanguage } from "@/hooks/use-language";
import { getOrderStatusLabel } from "@/lib/order-status-labels";
import { cn } from "@/lib/utils";

/** The slim sticky bar shown in place of the full orders toolbar when it is collapsed. */
export function CollapsedToolbar({
    open,
    allSelected,
    selectedCount,
    count,
    status,
    previewing,
    onSelectAll,
    setFilters,
    onScannerOpen,
    onReturnsOpen,
    onCreateOpen,
    onExpand,
}: {
    open: boolean;
    allSelected: boolean;
    selectedCount: number;
    /** null while the count would be misleading (see lib/orders/count-visibility). */
    count: number | null;
    status: string | undefined;
    previewing: boolean;
    onSelectAll: () => void;
    setFilters: React.Dispatch<React.SetStateAction<{ searchQuery?: string }>>;
    onScannerOpen: () => void;
    onReturnsOpen: () => void;
    onCreateOpen: () => void;
    onExpand: () => void;
}) {
    const { t, language } = useLanguage();
    const statusLabel = status && status !== "all" ? getOrderStatusLabel(status, language).replace("_", " ") : null;

    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_CHROME }}
                    className="sticky top-2 z-50"
                >
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl orders-collapsed-toolbar bg-[var(--card-bg)] border border-[var(--card-border)] shadow-lg">
                        {/* Left: Select All + Order count and status */}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onSelectAll}
                                disabled={previewing}
                                aria-pressed={allSelected}
                                aria-label={t("orders.tip.selectAll")}
                                className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                    allSelected
                                        ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                                        : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                )}
                                title={t("orders.tip.selectAll")}
                            >
                                {allSelected && <CheckSquare className="w-3 h-3" />}
                            </button>
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-foreground" />
                                <span className="font-bold text-lg text-foreground" data-orders-header-count>{count ?? "—"}</span>
                                <span className="text-muted text-sm">{t("orders.title")}</span>
                            </div>
                            {selectedCount > 0 && (
                                <span className="px-2.5 py-1 text-xs font-semibold bg-[var(--pastel-purple-light)] text-purple-700 rounded-full">
                                    {selectedCount} {t("orders.selected")}
                                </span>
                            )}
                            {statusLabel && (
                                <span className="px-2.5 py-1 text-xs font-semibold bg-[var(--pastel-yellow)] text-amber-800 rounded-full capitalize">
                                    {statusLabel}
                                </span>
                            )}
                        </div>

                        {/* Center: Quick search */}
                        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
                            <GlobalSearchField setFilters={setFilters} onScannerOpen={onScannerOpen} />
                        </div>

                        {/* Right: Quick actions + Expand */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onReturnsOpen}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-all text-sm font-semibold"
                                title={t("orders.tip.returnsCockpit")}
                            >
                                <PackageX className="w-4 h-4" />
                                <span className="hidden sm:inline">{t("orders.chip.refunds")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={onCreateOpen}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--button-success)] text-white shadow-sm hover:bg-[var(--button-success-hover)] transition-all text-sm font-semibold"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">{t("orders.status.new")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={onExpand}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground hover:bg-[var(--card-bg)] transition-all text-sm font-medium"
                                title={t("orders.tip.expandToolbar")}
                            >
                                <Maximize2 className="w-4 h-4" />
                                <span className="hidden lg:inline">{t("orders.filter.expand")}</span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
