"use client";

import { useMemo } from "react";
import { PackageOpen } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { averageOrder, buildStatement, productRows, type FinanceSummary } from "@/lib/finance/summary";
import { DailyBars } from "./daily-bars";
import { FailedDeliveries } from "./failed-deliveries";
import { FinanceStrip } from "./finance-strip";
import type { FinanceTab } from "./finance-tabs";
import { MoneyLocation } from "./money-location";
import { OrderSlices } from "./order-slices";
import { ProductProfitTable } from "./product-profit-table";
import { ProfitStatement } from "./profit-statement";
import { SummaryAlerts } from "./summary-alerts";
import { SummarySkeleton } from "./summary-skeleton";

interface SummaryViewProps {
    current: UseQueryResult<FinanceSummary>;
    /** The period before, when a comparison is on. */
    previous: UseQueryResult<FinanceSummary> | null;
    onOpenTab: (tab: FinanceTab) => void;
}

/**
 * The Summary tab: the dark strip, then the profit statement beside "where is
 * my money" and the average order, then the days, the products and refused
 * parcels. Every figure comes from one database answer (useFinanceSummary).
 */
export function SummaryView({ current, previous, onOpenTab }: SummaryViewProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const summary = current.data;
    const before = previous?.data;

    const statement = useMemo(() => (summary ? buildStatement(summary) : null), [summary]);
    const beforeFigures = useMemo(() => (before ? { summary: before, statement: buildStatement(before) } : null), [before]);
    const average = useMemo(() => (statement ? averageOrder(statement) : null), [statement]);
    const products = useMemo(() => (summary ? productRows(summary) : []), [summary]);

    if (current.isError && !summary) {
        return (
            <div className="mx-auto max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center" data-testid="summary-error">
                <h2 className="text-[16px] font-semibold text-rose-700 dark:text-rose-300">{t("fin.error.title")}</h2>
                <button
                    type="button"
                    onClick={() => void current.refetch()}
                    className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-medium text-stone-50 hover:opacity-90 dark:bg-stone-100 dark:text-stone-900"
                >
                    {t("fin.error.retry")}
                </button>
            </div>
        );
    }
    if (!summary || !statement) return <SummarySkeleton />;

    const nothingDelivered = statement.orders === 0;

    return (
        <div className={cn("space-y-5 transition-opacity", current.isPlaceholderData && "opacity-60")} data-testid="finance-summary">
            <FinanceStrip summary={summary} statement={statement} previous={beforeFigures} />
            <SummaryAlerts summary={summary} />

            {nothingDelivered && (
                <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-4" data-testid="summary-empty">
                    <PackageOpen className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <div>
                        <h2 className="text-left text-[15px] font-semibold text-foreground" dir={dir}>{t("fin.empty.title")}</h2>
                        <p className="text-left text-[13px] text-muted" dir={dir}>{t("fin.empty.sub")}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <ProfitStatement summary={summary} statement={statement} onOpenTab={onOpenTab} />
                </div>
                <div className="space-y-5 lg:col-span-2">
                    <MoneyLocation summary={summary} />
                    {average && <OrderSlices average={average} />}
                </div>
            </div>

            {!nothingDelivered && <DailyBars daily={summary.daily} />}

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
                {!nothingDelivered && (
                    <div className="lg:col-span-3">
                        <ProductProfitTable rows={products} />
                    </div>
                )}
                <div className="lg:col-span-2">
                    <FailedDeliveries summary={summary} />
                </div>
            </div>
        </div>
    );
}
