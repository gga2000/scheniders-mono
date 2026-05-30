"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    SlidersHorizontal,
    LayoutGrid,
    Table as TableIcon,
    Columns3,
    X,
    Calendar,
    Tag,
    AlertCircle,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QC_REASON_META } from "./qc-constants";
import type { QCReasonCategory } from "@/types/product";
import { useLanguage } from "@/components/providers/language-provider";

export type QCViewMode = "table" | "cards" | "kanban";
export type QCAgeFilter = "all" | "fresh" | "aging" | "stale" | "critical";

export interface QCFilters {
    search: string;
    reasonCategories: QCReasonCategory[];
    ageBucket: QCAgeFilter;
    hasPhotos: "all" | "yes" | "no";
    valueMin: number | null;
    valueMax: number | null;
}

export const DEFAULT_QC_FILTERS: QCFilters = {
    search: "",
    reasonCategories: [],
    ageBucket: "all",
    hasPhotos: "all",
    valueMin: null,
    valueMax: null,
};

interface QCFilterBarProps {
    filters: QCFilters;
    onChange: (f: QCFilters) => void;
    view: QCViewMode;
    onViewChange: (v: QCViewMode) => void;
    totalCount: number;
    filteredCount: number;
}

const AGE_BUCKETS: { value: QCAgeFilter; labelKey: string; color: string }[] = [
    { value: "all", labelKey: "qc.filter.age.all", color: "" },
    { value: "fresh", labelKey: "qc.filter.age.fresh", color: "text-emerald-600" },
    { value: "aging", labelKey: "qc.filter.age.aging", color: "text-amber-600" },
    { value: "stale", labelKey: "qc.filter.age.stale", color: "text-orange-600" },
    { value: "critical", labelKey: "qc.filter.age.critical", color: "text-rose-600" },
];

export function QCFilterBar({ filters, onChange, view, onViewChange, totalCount, filteredCount }: QCFilterBarProps) {
    const { t } = useLanguage();
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const toggleReason = (cat: QCReasonCategory) => {
        const next = filters.reasonCategories.includes(cat)
            ? filters.reasonCategories.filter((c) => c !== cat)
            : [...filters.reasonCategories, cat];
        onChange({ ...filters, reasonCategories: next });
    };

    const activeFilterCount =
        (filters.reasonCategories.length > 0 ? 1 : 0) +
        (filters.ageBucket !== "all" ? 1 : 0) +
        (filters.hasPhotos !== "all" ? 1 : 0) +
        (filters.valueMin !== null || filters.valueMax !== null ? 1 : 0);

    const clearAll = () => onChange(DEFAULT_QC_FILTERS);

    return (
        <div className="space-y-3">
            {/* Search + view switcher + advanced toggle */}
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                    <input
                        type="text"
                        data-qc-search="true"
                        placeholder={t("qc.filter.searchPlaceholder")}
                        value={filters.search}
                        onChange={(e) => onChange({ ...filters, search: e.target.value })}
                        className="w-full pl-10 pr-10 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition"
                    />
                    {filters.search && (
                        <button
                            onClick={() => onChange({ ...filters, search: "" })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--background)]"
                        >
                            <X className="w-4 h-4 text-muted" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setAdvancedOpen((s) => !s)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition",
                            activeFilterCount > 0
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-700"
                                : "bg-[var(--card-bg)] border-[var(--card-border)] hover:bg-[var(--background)]"
                        )}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        {t("qc.filter.filters")}
                        {activeFilterCount > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                        <ChevronDown className={cn("w-4 h-4 transition-transform", advancedOpen && "rotate-180")} />
                    </button>

                    {/* View switcher */}
                    <div className="flex items-center p-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl">
                        {(
                            [
                                { v: "table", Icon: TableIcon, labelKey: "qc.view.table" },
                                { v: "cards", Icon: LayoutGrid, labelKey: "qc.view.cards" },
                                { v: "kanban", Icon: Columns3, labelKey: "qc.view.kanban" },
                            ] as const
                        ).map(({ v, Icon, labelKey }) => (
                            <button
                                key={v}
                                onClick={() => onViewChange(v)}
                                title={t(labelKey)}
                                className={cn(
                                    "px-2.5 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition",
                                    view === v ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden md:inline">{t(labelKey)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Advanced filters panel */}
            <AnimatePresence initial={false}>
                {advancedOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.8, 0.25, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
                            {/* Reason chips */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                    <Tag className="w-3.5 h-3.5" /> {t("qc.filter.reason")}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(QC_REASON_META) as QCReasonCategory[]).map((cat) => {
                                        const meta = QC_REASON_META[cat];
                                        const ReasonIcon = meta.icon;
                                        const active = filters.reasonCategories.includes(cat);
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => toggleReason(cat)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition",
                                                    active
                                                        ? "bg-amber-500 border-amber-500 text-white"
                                                        : "bg-[var(--background)] border-[var(--card-border)] hover:border-amber-500/50"
                                                )}
                                            >
                                                <ReasonIcon className="w-3 h-3" />
                                                {t(`qc.reason.${cat}`)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Age bucket */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                    <Calendar className="w-3.5 h-3.5" /> {t("qc.filter.age")}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {AGE_BUCKETS.map(({ value, labelKey, color }) => {
                                        const active = filters.ageBucket === value;
                                        return (
                                            <button
                                                key={value}
                                                onClick={() => onChange({ ...filters, ageBucket: value })}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-full border text-xs font-medium transition",
                                                    active
                                                        ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                                                        : cn("bg-[var(--background)] border-[var(--card-border)] hover:border-[var(--ink)]/30", color)
                                                )}
                                            >
                                                {t(labelKey)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Photos + value range */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                        <AlertCircle className="w-3.5 h-3.5" /> {t("qc.filter.photos")}
                                    </label>
                                    <div className="flex gap-2">
                                        {(["all", "yes", "no"] as const).map((v) => (
                                            <button
                                                key={v}
                                                onClick={() => onChange({ ...filters, hasPhotos: v })}
                                                className={cn(
                                                    "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition",
                                                    filters.hasPhotos === v
                                                        ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                                                        : "bg-[var(--background)] border-[var(--card-border)] hover:border-[var(--ink)]/30"
                                                )}
                                            >
                                                {v === "all" ? t("qc.filter.photos.any") : v === "yes" ? t("qc.filter.photos.yes") : t("qc.filter.photos.no")}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                                        {t("qc.filter.value")}
                                    </label>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="number"
                                            placeholder={t("qc.filter.min")}
                                            value={filters.valueMin ?? ""}
                                            onChange={(e) =>
                                                onChange({ ...filters, valueMin: e.target.value ? Number(e.target.value) : null })
                                            }
                                            className="flex-1 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm"
                                        />
                                        <span className="text-muted">—</span>
                                        <input
                                            type="number"
                                            placeholder={t("qc.filter.max")}
                                            value={filters.valueMax ?? ""}
                                            onChange={(e) =>
                                                onChange({ ...filters, valueMax: e.target.value ? Number(e.target.value) : null })
                                            }
                                            className="flex-1 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                                <span className="text-xs text-muted">
                                    {t("qc.filter.countOfTotal", { filtered: filteredCount, total: totalCount })}
                                </span>
                                {activeFilterCount > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className="text-xs font-medium text-amber-600 hover:text-amber-700 underline"
                                    >
                                        {t("qc.filter.clearAll")}
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active pills row */}
            {activeFilterCount > 0 && !advancedOpen && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted">{t("qc.filter.active", { count: activeFilterCount })}</span>
                    {filters.reasonCategories.map((cat) => {
                        const ReasonIcon = QC_REASON_META[cat].icon;
                        return (
                            <button
                                key={cat}
                                onClick={() => toggleReason(cat)}
                                className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-500/10 text-amber-800 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 transition"
                            >
                                <ReasonIcon className="w-3 h-3" />
                                <span>{t(`qc.reason.${cat}`)}</span>
                                <X className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                            </button>
                        );
                    })}
                    {filters.ageBucket !== "all" && (
                        <button
                            onClick={() => onChange({ ...filters, ageBucket: "all" })}
                            className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-500/10 text-amber-800 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 transition"
                        >
                            {t("qc.filter.age")}: {t(AGE_BUCKETS.find((b) => b.value === filters.ageBucket)?.labelKey || "qc.filter.age.all")}
                            <X className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                        </button>
                    )}
                    {filters.hasPhotos !== "all" && (
                        <button
                            onClick={() => onChange({ ...filters, hasPhotos: "all" })}
                            className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-500/10 text-amber-800 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 transition"
                        >
                            {filters.hasPhotos === "yes" ? t("qc.filter.photos.yes") : t("qc.filter.photos.no")}
                            <X className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                        </button>
                    )}
                    {(filters.valueMin !== null || filters.valueMax !== null) && (
                        <button
                            onClick={() => onChange({ ...filters, valueMin: null, valueMax: null })}
                            className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-500/10 text-amber-800 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 transition"
                        >
                            {t("qc.filter.value")}: {filters.valueMin ?? "*"}–{filters.valueMax ?? "*"}
                            <X className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                        </button>
                    )}
                    <button onClick={clearAll} className="text-xs text-muted hover:text-foreground underline ml-1">
                        {t("qc.filter.clearShort")}
                    </button>
                </div>
            )}
        </div>
    );
}
