"use client";

import { Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useFinancePeriod } from "@/hooks/use-finance-period";
import { useFinanceSummary } from "@/hooks/use-finance-summary";
import { useHydrated } from "@/hooks/use-sidebar-collapsed";
import { baghdadDayKey } from "@/lib/order-window";
import { summaryCsvTable } from "@/lib/finance/summary-export";
import { PeriodPicker } from "@/components/finances/hub/period-picker";
import { FINANCE_TABS, FinanceTabs, type FinanceTab } from "@/components/finances/summary/finance-tabs";
import { SummaryView } from "@/components/finances/summary/summary-view";

const tabLoading = () => <div className="h-[400px] animate-pulse rounded-2xl bg-[var(--card-bg)]" />;

// The three screens kept from the old page, loaded when their tab is opened.
const ExpensesTab = dynamic(
    () => import("@/components/finances/hub/expenses/expenses-tab").then((m) => ({ default: m.ExpensesTab })),
    { loading: tabLoading },
);
const SalariesTab = dynamic(
    () => import("@/components/salary/salaries-tab").then((m) => ({ default: m.SalariesTab })),
    { loading: tabLoading },
);
const ReturnsPanel = dynamic(
    () => import("@/components/finances/summary/returns-panel").then((m) => ({ default: m.ReturnsPanel })),
    { loading: tabLoading },
);

function isFinanceTab(value: string | null | undefined): value is FinanceTab {
    return FINANCE_TABS.some((tab) => tab === value);
}

/**
 * The new Finances page, at its own address until it replaces /finances: one
 * Summary screen built on get_finance_summary, plus the Expenses, Salaries and
 * Returns screens of the old page as they are.
 */
export default function FinancesNewPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[var(--background)]"><PageSkeleton /></div>}>
            <FinancesNewContent />
        </Suspense>
    );
}

function FinancesNewContent() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawTab = searchParams?.get("tab");
    const activeTab: FinanceTab = isFinanceTab(rawTab) ? rawTab : "summary";

    // The period is restored from this browser's storage, so the page renders once it has mounted.
    const mounted = useHydrated();

    const { period, compareRange, dateRangeStrings, applyPreset, setCustom, setCompareMode } = useFinancePeriod("last30");
    const compareDays = useMemo(
        () => (compareRange ? { startDate: baghdadDayKey(compareRange.start), endDate: baghdadDayKey(compareRange.end) } : null),
        [compareRange],
    );
    const { current, previous } = useFinanceSummary(dateRangeStrings, compareDays);

    const openTab = (tab: FinanceTab) => {
        router.push(tab === "summary" ? "/finances/new" : `/finances/new?tab=${tab}`, { scroll: false });
    };

    const summary = current.data;
    const exportCsv = async () => {
        if (!summary) return;
        const { downloadCsv } = await import("@/lib/export-utils");
        const { headers, rows } = summaryCsvTable(summary, (key) => t(key));
        downloadCsv(headers, rows, `finances_${summary.from}_to_${summary.to}`);
    };

    if (!mounted) {
        return <div className="min-h-screen bg-[var(--background)]"><PageSkeleton /></div>;
    }

    return (
        <div className="min-h-screen bg-[var(--background)] pb-16">
            <div className="mx-auto max-w-[1480px] space-y-5 px-4 pt-6 md:px-6 lg:px-8">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground">{t("fin.title")}</h1>
                            <span className="rounded-full bg-[#dcfb3a] px-2.5 py-0.5 text-[11.5px] font-semibold text-stone-900">{t("fin.preview")}</span>
                        </div>
                        <p className="mt-1 text-left text-[14px] text-muted" dir={dir}>{t("fin.subtitle")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/finances"
                            className="px-2 text-[13px] text-muted underline decoration-[var(--card-border)] underline-offset-4 hover:text-foreground"
                        >
                            {t("fin.oldPage")}
                        </Link>
                        <PeriodPicker
                            period={period}
                            onApplyPreset={applyPreset}
                            onApplyCustom={setCustom}
                            onChangeCompareMode={setCompareMode}
                        />
                        {activeTab === "summary" && (
                            <button
                                type="button"
                                onClick={() => void exportCsv()}
                                disabled={!summary}
                                className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-stone-400 disabled:opacity-50"
                                data-testid="finance-export"
                            >
                                <Download className="size-4" aria-hidden="true" />
                                {t("fin.export")}
                            </button>
                        )}
                    </div>
                </header>

                <FinanceTabs active={activeTab} onChange={openTab} />

                {activeTab === "summary" && <SummaryView current={current} previous={previous} onOpenTab={openTab} />}
                {activeTab === "expenses" && (
                    <ExpensesTab period={period} comparePeriod={compareRange} dateRangeStrings={dateRangeStrings} />
                )}
                {activeTab === "salaries" && <SalariesTab />}
                {activeTab === "returns" && <ReturnsPanel period={period} compareRange={compareRange} />}
            </div>
        </div>
    );
}
