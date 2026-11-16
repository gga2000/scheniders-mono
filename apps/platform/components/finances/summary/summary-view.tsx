"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PackageOpen } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { buildStatement, productRows, type FinanceSummary } from "@/lib/finance/summary";
import { DailyCosts } from "./daily-costs";
import { FinanceStrip } from "./finance-strip";
import type { FinanceTab } from "./finance-tabs";
import { MoneyRoute } from "./money-route";
import { ProductRanking } from "./product-ranking";
import { ProfitPath } from "./profit-path";
import { ProfitStatement } from "./profit-statement";
import { ReturnedParcels } from "./returned-parcels";
import { StockShelf } from "./stock-shelf";
import { SummaryPanel } from "./summary-card";
import { SummaryAlerts } from "./summary-alerts";
import { SummarySkeleton } from "./summary-skeleton";

const DeliveryImportModal = dynamic(
    () => import("@/components/delivery-import/delivery-import-modal").then((m) => ({ default: m.DeliveryImportModal })),
    { ssr: false },
);

interface SummaryViewProps {
    current: UseQueryResult<FinanceSummary>;
    /** The period before, when a comparison is on. */
    previous: UseQueryResult<FinanceSummary> | null;
    onOpenTab: (tab: FinanceTab) => void;
}

/**
 * The Summary tab, in the order a shop owner asks: did I make money (the dark
 * strip), where did my sales go (the statement), where is my cash and is the
 * period building (the money route, then the path beside it), which product
 * earns, then one panel of three columns: what returns cost, what the ads and
 * the daily costs ask of each day, and the money sitting in stock.
 * Every figure comes from one database answer (useFinanceSummary).
 */
export function SummaryView({ current, previous, onOpenTab }: SummaryViewProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const summary = current.data;
    const before = previous?.data;
    const [importOpen, setImportOpen] = useState(false);

    const statement = useMemo(() => (summary ? buildStatement(summary) : null), [summary]);
    const beforeFigures = useMemo(() => (before ? { summary: before, statement: buildStatement(before) } : null), [before]);
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
            <SummaryAlerts summary={summary} onOpenTab={onOpenTab} />

            {nothingDelivered && (
                <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-4" data-testid="summary-empty">
                    <PackageOpen className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <div>
                        <h2 className="text-left text-[15px] font-semibold text-foreground" dir={dir}>{t("fin.empty.title")}</h2>
                        <p className="text-left text-[13px] text-muted" dir={dir}>{t("fin.empty.sub")}</p>
                    </div>
                </div>
            )}

            <ProfitStatement summary={summary} statement={statement} previous={beforeFigures?.statement ?? null} onOpenTab={onOpenTab} />

            <div className={cn("grid grid-cols-1 gap-5", !nothingDelivered && "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
                <MoneyRoute
                    summary={summary}
                    delivery={statement.lines.find((l) => l.id === "delivery") ?? { id: "delivery", amount: 0, share: 0, parts: [] }}
                    onAddPayment={() => setImportOpen(true)}
                />
                {!nothingDelivered && <ProfitPath daily={summary.daily} />}
            </div>

            {!nothingDelivered && <ProductRanking rows={products} />}

            <SummaryPanel testId="summary-bottom">
                <ReturnedParcels summary={summary} />
                <DailyCosts summary={summary} statement={statement} onOpenTab={onOpenTab} />
                <StockShelf summary={summary} />
            </SummaryPanel>

            {importOpen && (
                <DeliveryImportModal
                    open
                    onClose={() => {
                        setImportOpen(false);
                        // A confirmed (or removed) payment file changes what reached the shop and which orders are delivered.
                        void current.refetch();
                    }}
                />
            )}
        </div>
    );
}
