"use client";

import { useLanguage } from "@/hooks/use-language";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useFinanceOrders } from "@/hooks/use-finance-orders";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useExpenses } from "@/hooks/use-expenses";
import { useFinancePeriod } from "@/hooks/use-finance-period";
import { useFinanceOverview } from "@/hooks/use-finance-overview";
import { useFinanceInsights } from "@/hooks/use-finance-insights";
import { useFinanceRevenue } from "@/hooks/use-finance-revenue";
import { useCashPosition } from "@/hooks/use-cash-position";
import { useInTransitSince } from "@/hooks/use-in-transit-since";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { PageHeader } from "@/components/finances/hub/page-header";
import { TabsShell, type FinanceTabId } from "@/components/finances/hub/tabs-shell";
import { CommandPalette } from "@/components/finances/hub/command-palette";
import { exportFinanceHubToCSV, printFinanceHubReport } from "@/lib/finance-hub-export";

// Overview widgets (lazy-loaded)
const HeroStrip = dynamic(
    () => import("@/components/finances/hub/overview/hero-strip").then((m) => ({ default: m.HeroStrip })),
    { loading: () => <div className="h-[132px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const PnLWaterfall = dynamic(
    () => import("@/components/finances/hub/overview/pnl-waterfall").then((m) => ({ default: m.PnLWaterfall })),
    { loading: () => <div className="h-[420px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const RevenueByDimension = dynamic(
    () => import("@/components/finances/hub/overview/revenue-by-dimension").then((m) => ({ default: m.RevenueByDimension })),
    { loading: () => <div className="h-[380px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const TopMovers = dynamic(
    () => import("@/components/finances/hub/overview/top-movers").then((m) => ({ default: m.TopMovers })),
    { loading: () => <div className="h-[240px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const InsightsBanner = dynamic(
    () => import("@/components/finances/hub/overview/insights-banner").then((m) => ({ default: m.InsightsBanner })),
    { loading: () => <div className="h-[88px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const GoalsStrip = dynamic(
    () => import("@/components/finances/hub/overview/goals-strip").then((m) => ({ default: m.GoalsStrip })),
    { loading: () => <div className="h-[200px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const CashHealthCard = dynamic(
    () => import("@/components/finances/hub/overview/cash-health-card").then((m) => ({ default: m.CashHealthCard })),
    { loading: () => <div className="h-[280px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Print & Ship tab (lazy-loaded)
const PrintShipTab = dynamic(
    () => import("@/components/finances/hub/print/print-ship-tab").then((m) => ({ default: m.PrintShipTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Revenue tab widgets (lazy-loaded)
const RevenueDecomposition = dynamic(
    () => import("@/components/finances/hub/revenue/revenue-decomposition").then((m) => ({ default: m.RevenueDecomposition })),
    { loading: () => <div className="h-[420px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const MarginHeatmap = dynamic(
    () => import("@/components/finances/hub/revenue/margin-heatmap").then((m) => ({ default: m.MarginHeatmap })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const ChannelPnL = dynamic(
    () => import("@/components/finances/hub/revenue/channel-pnl").then((m) => ({ default: m.ChannelPnL })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const RevenueRefundsImpact = dynamic(
    () => import("@/components/finances/hub/revenue/refunds-impact").then((m) => ({ default: m.RefundsImpact })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Expenses tab (lazy-loaded)
const ExpensesTab = dynamic(
    () => import("@/components/finances/hub/expenses/expenses-tab").then((m) => ({ default: m.ExpensesTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Payouts tab (lazy-loaded)
const PayoutsTab = dynamic(
    () => import("@/components/finances/hub/payouts/payouts-tab").then((m) => ({ default: m.PayoutsTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Refunds tab (lazy-loaded)
const RefundsTab = dynamic(
    () => import("@/components/finances/hub/refunds/refunds-tab").then((m) => ({ default: m.RefundsTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Customers tab (lazy-loaded)
const CustomersFinanceTab = dynamic(
    () => import("@/components/finances/hub/customers/customers-tab").then((m) => ({ default: m.CustomersFinanceTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Products tab (lazy-loaded)
const ProductsFinanceTab = dynamic(
    () => import("@/components/finances/hub/products/products-tab").then((m) => ({ default: m.ProductsFinanceTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Forecasts tab (lazy-loaded)
const ForecastsTab = dynamic(
    () => import("@/components/finances/hub/forecasts/forecasts-tab").then((m) => ({ default: m.ForecastsTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Invoices tab (lazy-loaded)
const InvoicesTab = dynamic(
    () => import("@/components/finances/hub/invoices/invoices-tab").then((m) => ({ default: m.InvoicesTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Reports tab (lazy-loaded)
const ReportsTab = dynamic(
    () => import("@/components/finances/hub/reports/reports-tab").then((m) => ({ default: m.ReportsTab })),
    { loading: () => <div className="h-[400px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

// Cash tab widgets (lazy-loaded)
const CashPositionHero = dynamic(
    () => import("@/components/finances/hub/cash/cash-position-hero").then((m) => ({ default: m.CashPositionHero })),
    { loading: () => <div className="h-[132px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const CODAgingBuckets = dynamic(
    () => import("@/components/finances/hub/cash/cod-aging-buckets").then((m) => ({ default: m.CODAgingBuckets })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const StuckInTransit = dynamic(
    () => import("@/components/finances/hub/cash/stuck-in-transit").then((m) => ({ default: m.StuckInTransit })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const CashTimeline = dynamic(
    () => import("@/components/finances/hub/cash/cash-timeline").then((m) => ({ default: m.CashTimeline })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const CollectionByCity = dynamic(
    () => import("@/components/finances/hub/cash/collection-by-city").then((m) => ({ default: m.CollectionByCity })),
    { loading: () => <div className="h-[320px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

const SalariesTab = dynamic(
    () => import("@/components/salary/salaries-tab").then((m) => ({ default: m.SalariesTab })),
    { loading: () => <div className="h-[480px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);
const ProfitAnalysisTab = dynamic(
    () => import("@/components/finances/hub/profit-analysis/profit-analysis-tab").then((m) => ({ default: m.ProfitAnalysisTab })),
    { loading: () => <div className="h-[480px] rounded-2xl bg-[var(--card-bg)] animate-pulse" /> }
);

/** Tabs that load their own data and never read the order book. */
const ORDER_FREE_TABS: FinanceTabId[] = ["expenses", "payouts", "print", "salaries"];

const VALID_TABS: FinanceTabId[] = [
    "overview", "revenue", "profit_analysis", "cash", "expenses", "payouts",
    "invoices", "refunds", "customers", "products", "print",
    "forecasts", "reports", "salaries",
];

export default function FinancesPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[var(--background)]"><PageSkeleton /></div>}>
            <FinancesContent />
        </Suspense>
    );
}

function FinancesContent() {
    const { t, language } = useLanguage();
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawTab = searchParams?.get("tab");
    const activeTab: FinanceTabId =
        rawTab && VALID_TABS.includes(rawTab as FinanceTabId) ? (rawTab as FinanceTabId) : "overview";

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const handleTabChange = (tab: FinanceTabId) => {
        const url = tab === "overview" ? "/finances" : `/finances?tab=${tab}`;
        router.push(url, { scroll: false });
    };

    // Period state
    const {
        period, compareRange, granularity, dateRangeStrings,
        applyPreset, setCustom, setCompareMode,
    } = useFinancePeriod("last30");

    // Data sources
    const { orders, loading: ordersLoading, error: ordersError } = useFinanceOrders({
        start: period.start,
        end: period.end,
        compareStart: compareRange?.start,
    });
    const { products } = useProductsCrud();
    const { expenses, addExpense } = useExpenses({
        startDate: dateRangeStrings.startDate,
        endDate: dateRangeStrings.endDate,
    });

    const overview = useFinanceOverview(
        orders,
        products,
        expenses,
        { start: period.start, end: period.end },
        compareRange,
        granularity,
    );

    const insights = useFinanceInsights(overview);
    const inTransitSince = useInTransitSince(orders);
    const cash = useCashPosition(orders, inTransitSince, { start: period.start, end: period.end });
    const revenue = useFinanceRevenue(
        orders,
        products,
        { start: period.start, end: period.end },
        compareRange,
        granularity,
    );

    const handleExport = () => {
        if (ordersLoading) return;
        exportFinanceHubToCSV({
            language,
            overview,
            revenue,
            cash,
            period: { start: period.start, end: period.end },
        });
    };

    const handlePrint = () => {
        if (ordersLoading) return;
        printFinanceHubReport({
            language,
            overview,
            revenue,
            cash,
            period: { start: period.start, end: period.end },
        });
    };

    if (!mounted) {
        return <div className="min-h-screen bg-[var(--background)]"><PageSkeleton /></div>;
    }

    // Header, tabs and the tabs that read their own data render at once; only
    // the tabs built on the order book wait for it.
    const needsOrders = !ORDER_FREE_TABS.includes(activeTab);

    return (
        <div className="min-h-screen bg-[var(--background)] pb-16">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 pt-6 space-y-6">
                <PageHeader
                    period={period}
                    onApplyPreset={applyPreset}
                    onApplyCustom={setCustom}
                    onChangeCompareMode={setCompareMode}
                    onExport={ordersLoading ? undefined : handleExport}
                    onPrint={ordersLoading ? undefined : handlePrint}
                />

                <TabsShell activeTab={activeTab} onChange={handleTabChange} />

                <CommandPalette
                    onChangeTab={handleTabChange}
                    onApplyPreset={applyPreset}
                    onExport={handleExport}
                    onPrint={handlePrint}
                />

                {needsOrders && ordersError ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 max-w-md mx-auto text-center">
                        <h2 className="text-lg font-bold text-rose-700 dark:text-rose-300 mb-1">{t("finances.loadError")}</h2>
                        <p className="text-sm text-muted">{ordersError}</p>
                    </div>
                ) : needsOrders && ordersLoading ? (
                    <PageSkeleton />
                ) : (
                    <>
                    {activeTab === "overview" && (
                        <div className="space-y-5">
                            <InsightsBanner insights={insights} />
                            <HeroStrip data={overview} />
                            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                                <div className="xl:col-span-3">
                                    <PnLWaterfall data={overview} />
                                </div>
                                <div className="xl:col-span-2 space-y-5">
                                    <CashHealthCard data={cash} />
                                    <TopMovers data={overview} />
                                </div>
                            </div>
                            <RevenueByDimension data={overview} />
                            <GoalsStrip data={overview} presetKey={period.preset} />
                        </div>
                    )}

                    {activeTab === "revenue" && (
                        <div className="space-y-5">
                            <RevenueDecomposition data={revenue.decomposition} />
                            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                                <div className="xl:col-span-3">
                                    <ChannelPnL rows={revenue.channels} />
                                </div>
                                <div className="xl:col-span-2">
                                    <RevenueRefundsImpact data={revenue.refunds} />
                                </div>
                            </div>
                            <MarginHeatmap data={revenue.heatmap} />
                        </div>
                    )}

                    {activeTab === "cash" && (
                        <div className="space-y-5">
                            <CashPositionHero data={cash} />
                            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                                <div className="xl:col-span-3">
                                    <CashTimeline data={cash} />
                                </div>
                                <div className="xl:col-span-2">
                                    <CODAgingBuckets buckets={cash.aging} oldestStuckDays={cash.oldestStuckDays} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                <StuckInTransit orders={cash.stuckOrders} />
                                <CollectionByCity rows={cash.byGovernorate} />
                            </div>
                        </div>
                    )}

                    {activeTab === "expenses" && (
                        <ExpensesTab
                            period={period}
                            comparePeriod={compareRange}
                            dateRangeStrings={dateRangeStrings}
                        />
                    )}

                    {activeTab === "payouts" && <PayoutsTab />}

                    {activeTab === "refunds" && (
                        <RefundsTab orders={orders} period={period} compareRange={compareRange} />
                    )}

                    {activeTab === "invoices" && (
                        <InvoicesTab orders={orders} expenses={expenses} period={period} />
                    )}

                    {activeTab === "customers" && (
                        <CustomersFinanceTab orders={orders} period={period} compareRange={compareRange} granularity={granularity} />
                    )}

                    {activeTab === "print" && <PrintShipTab />}

                    {activeTab === "products" && (
                        <ProductsFinanceTab orders={orders} products={products} period={period} granularity={granularity} />
                    )}

                    {activeTab === "forecasts" && (
                        <ForecastsTab orders={orders} expenses={expenses} period={period} />
                    )}

                    {activeTab === "reports" && (
                        <ReportsTab period={period} onExport={ordersLoading ? undefined : handleExport} onPrint={ordersLoading ? undefined : handlePrint} />
                    )}

                    {activeTab === "profit_analysis" && (
                        <ProfitAnalysisTab
                            orders={orders}
                            products={products}
                            expenses={expenses}
                            period={period}
                            dateRange={dateRangeStrings}
                            addExpense={addExpense}
                        />
                    )}

                    {activeTab === "salaries" && <SalariesTab />}
                    </>
                )}
            </div>
        </div>
    );
}
