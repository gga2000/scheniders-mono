"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Target, TrendingUp, ListChecks, Truck } from "lucide-react";
import { OverviewCards } from "@/components/analytics/overview-cards";
import { PipelineSummaryCard } from "@/components/analytics/pipeline-summary-card";
import { ProfitSummaryCards } from "@/components/analytics/profit-summary-cards";
import { OrderFunnelCard } from "@/components/analytics/order-funnel-card";
import { CostCompositionChart } from "@/components/analytics/cost-composition-chart";
import { ProfitBreakdownTable } from "@/components/analytics/profit-breakdown-table";
import { useOrderProfits } from "@/hooks/use-order-profits";
import type { CostSnapshots } from "@/lib/finance/item-cost";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { Order, Product } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import type { useExpenses } from "@/hooks/use-expenses";

const MarketingExpenseModal = dynamic(
    () => import("@/components/analytics/marketing-expense-modal").then((m) => ({ default: m.MarketingExpenseModal })),
    { ssr: false }
);
const DeliveryImportModal = dynamic(
    () => import("@/components/delivery-import/delivery-import-modal").then((m) => ({ default: m.DeliveryImportModal })),
    { ssr: false }
);

interface ProfitAnalysisTabProps {
    orders: Order[];
    products: Product[];
    expenses: Expense[];
    period: { start: Date; end: Date };
    dateRange: { startDate: string; endDate: string };
    addExpense: ReturnType<typeof useExpenses>["addExpense"];
    /** Frozen per-line costs of delivered orders, so edited product costs do not re-price history. */
    costSnapshots?: CostSnapshots;
}

/**
 * Profit Analysis — Pipeline vs. Realized profit, rendered inline as a Finances tab.
 * Mirrors the legacy /analytics "profit" view but driven by the Finances page period
 * so it stays consistent with the other tabs and keeps the tab bar in place.
 */
export function ProfitAnalysisTab({ orders, products, expenses, period, dateRange, addExpense, costSnapshots }: ProfitAnalysisTabProps) {
    const { t } = useLanguage();

    const [isDeliveryImportOpen, setIsDeliveryImportOpen] = useState(false);
    const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);

    const handleAddMarketingExpense = async (data: { amount: number; notes?: string; date: string }) => {
        await addExpense({
            amount: data.amount,
            category: "marketing",
            expense_date: data.date,
            notes: data.notes,
        });
    };

    const marketingCost = useMemo(
        () => expenses.filter((e) => e.category === "marketing").reduce((sum, e) => sum + e.amount, 0),
        [expenses]
    );

    const ordersInRange = useMemo(
        () =>
            orders.filter((order) => {
                const d = new Date(order.created_at);
                return d >= period.start && d <= period.end;
            }),
        [orders, period.start, period.end]
    );

    const {
        orderCostBreakdowns,
        profitSummary,
        productProfitAnalysis,
        pipelineSummary,
        funnelSummary,
    } = useOrderProfits(ordersInRange, products, marketingCost, costSnapshots);

    return (
        <div className="space-y-6">
            {/* Quick actions — parity with the legacy Analytics & Finances header */}
            <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                    onClick={() => setIsDeliveryImportOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
                >
                    <Truck className="w-4 h-4" />
                    {t("analytics.importDelivery")}
                </button>
                <button
                    onClick={() => setIsMarketingModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
                >
                    <Target className="w-4 h-4" />
                    {t("analytics.marketing")}
                </button>
            </div>

            {/* Overview cards — full width at top */}
            <OverviewCards profitSummary={profitSummary} pipelineSummary={pipelineSummary} />

            {/* Two-column grid: Pipeline + Realized Profit */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-indigo-600" />
                        {t("analytics.pipeline")}
                        <span className="text-xs font-normal text-muted">{t("analytics.pipelineDesc")}</span>
                    </h2>
                    <PipelineSummaryCard pipeline={pipelineSummary} />
                </div>

                <div className="flex flex-col">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        {t("analytics.realizedProfit")}
                        <span className="text-xs font-normal text-muted">{t("analytics.realizedProfitDesc")}</span>
                    </h2>
                    <ProfitSummaryCards summary={profitSummary} />
                </div>
            </div>

            {/* Order funnel — full width */}
            <div className="flex flex-col">
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-teal-600" />
                    {t("analytics.orderFunnel")}
                    <span className="text-xs font-normal text-muted">{t("analytics.orderFunnelDesc")}</span>
                </h2>
                <OrderFunnelCard funnel={funnelSummary} />
            </div>

            {/* Cost composition + product profitability */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                        {t("analytics.costComposition")}
                    </h3>
                    <CostCompositionChart summary={profitSummary} />
                </div>

                <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                        {t("analytics.productProfitability")}
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {productProfitAnalysis.slice(0, 10).map((product, index) => (
                            <div
                                key={product.name}
                                className="flex items-center justify-between p-3 rounded-xl bg-[var(--background)] hover:bg-[var(--card-border)] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                        index === 0 ? "bg-amber-100 text-amber-700" :
                                            index === 1 ? "bg-gray-200 text-gray-700" :
                                                index === 2 ? "bg-orange-100 text-orange-700" :
                                                    "bg-[var(--card-bg)] text-muted"
                                    )}>
                                        {index + 1}
                                    </span>
                                    <div>
                                        <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                                            {product.name}
                                        </p>
                                        <p className="text-xs text-muted">{product.sold} {t("analytics.productSold")}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={cn(
                                        "font-semibold",
                                        product.profit >= 0 ? "text-green-600" : "text-rose-600"
                                    )}>
                                        {new Intl.NumberFormat("en-IQ").format(product.profit)} IQD
                                    </p>
                                    <p className="text-xs text-muted">
                                        {product.revenue > 0
                                            ? ((product.profit / product.revenue) * 100).toFixed(1)
                                            : 0}% {t("analytics.productMargin")}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {productProfitAnalysis.length === 0 && (
                            <p className="text-center text-muted py-8">{t("analytics.noProductData")}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Per-order breakdown table */}
            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                    {t("analytics.profitBreakdown")}
                </h3>
                <ProfitBreakdownTable breakdowns={orderCostBreakdowns} />
            </div>

            {/* Modals */}
            <MarketingExpenseModal
                isOpen={isMarketingModalOpen}
                onClose={() => setIsMarketingModalOpen(false)}
                onSubmit={handleAddMarketingExpense}
                dateRange={dateRange}
            />
            <DeliveryImportModal
                open={isDeliveryImportOpen}
                onClose={() => setIsDeliveryImportOpen(false)}
            />
        </div>
    );
}
