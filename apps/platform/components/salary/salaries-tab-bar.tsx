"use client";

import { Download, FileSpreadsheet, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

export const SALARIES_SUB_TABS = ["current", "history", "advances", "penalties"] as const;
export type SalariesSubTab = (typeof SALARIES_SUB_TABS)[number];

export const SALARIES_SORTS = ["name", "net_desc", "net_asc", "last_paid"] as const;
export type SalariesSort = (typeof SALARIES_SORTS)[number];

const TAB_KEYS: Record<SalariesSubTab, string> = {
    current: "payroll.tab.current",
    history: "payroll.tab.history",
    advances: "payroll.tab.advances",
    penalties: "payroll.tab.penalties",
};

const SORT_KEYS: Record<SalariesSort, string> = {
    name: "payroll.sort.name",
    net_desc: "payroll.sort.highest",
    net_asc: "payroll.sort.lowest",
    last_paid: "payroll.sort.lastPaid",
};

interface SalariesTabBarProps {
    activeTab: SalariesSubTab;
    onTabChange: (tab: SalariesSubTab) => void;
    search: string;
    onSearchChange: (value: string) => void;
    sortBy: SalariesSort;
    onSortChange: (value: SalariesSort) => void;
    exportDisabled: boolean;
    onExportCsv: () => void;
    onExportPdf: () => void;
    /** Members hidden from the grid; the show/hide switch appears only when this is above 0. */
    hiddenCount: number;
    showHidden: boolean;
    onToggleHidden: () => void;
}

const control =
    "h-9 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[13px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/20";
const quietButton = cn(control, "inline-flex items-center gap-1.5 px-3 text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed");

/** /salaries second row: the four views, plus search, sort and exports for the current period. */
export function SalariesTabBar({
    activeTab,
    onTabChange,
    search,
    onSearchChange,
    sortBy,
    onSortChange,
    exportDisabled,
    onExportCsv,
    onExportPdf,
    hiddenCount,
    showHidden,
    onToggleHidden,
}: SalariesTabBarProps) {
    const { t } = useLanguage();

    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--card-border)]">
            <nav className="flex items-center gap-1" aria-label={t("payroll.tab.label")}>
                {SALARIES_SUB_TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        aria-current={activeTab === tab ? "page" : undefined}
                        onClick={() => onTabChange(tab)}
                        className={cn(
                            "-mb-px h-10 px-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
                            activeTab === tab ? "border-[var(--ink)] text-foreground" : "border-transparent text-muted hover:text-foreground",
                        )}
                    >
                        {t(TAB_KEYS[tab])}
                    </button>
                ))}
            </nav>

            {activeTab === "current" && (
                <div className="ms-auto flex items-center gap-2 pb-2">
                    <label className="relative">
                        <span className="sr-only">{t("payroll.searchLabel")}</span>
                        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" aria-hidden="true" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder={t("payroll.searchPlaceholder")}
                            className={cn(control, "w-48 ps-8 pe-3 placeholder:text-[var(--foreground-muted)]")}
                        />
                    </label>
                    <select
                        aria-label={t("payroll.sort.label")}
                        value={sortBy}
                        onChange={(e) => onSortChange(SALARIES_SORTS.find((s) => s === e.target.value) ?? "name")}
                        className={cn(control, "px-3 cursor-pointer")}
                    >
                        {SALARIES_SORTS.map((s) => <option key={s} value={s}>{t(SORT_KEYS[s])}</option>)}
                    </select>
                    {hiddenCount > 0 && (
                        <button type="button" aria-pressed={showHidden} onClick={onToggleHidden} className={cn(quietButton, showHidden && "text-foreground border-[var(--ink)]/40")}>
                            {showHidden ? t("payroll.hidden.hide") : t("payroll.hidden.show", { count: hiddenCount })}
                        </button>
                    )}
                    <button type="button" onClick={onExportCsv} disabled={exportDisabled} className={quietButton} title={t("payroll.exportCsv")}>
                        <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                        CSV
                    </button>
                    <button type="button" onClick={onExportPdf} disabled={exportDisabled} className={quietButton} title={t("payroll.summaryPdf")}>
                        <Download className="w-4 h-4" aria-hidden="true" />
                        {t("payroll.summaryPdfShort")}
                    </button>
                </div>
            )}
        </div>
    );
}
