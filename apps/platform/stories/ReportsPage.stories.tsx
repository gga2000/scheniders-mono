import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { KPICards } from "@/components/reports/kpi-cards";
import { StatusFlowDiagram } from "@/components/reports/status-flow-diagram";
import { ContactHeatmap } from "@/components/reports/contact-heatmap";
import { TimeAnalysis } from "@/components/reports/time-analysis";
import { RejectionBreakdown } from "@/components/reports/rejection-breakdown";
import { ReturnBreakdown } from "@/components/reports/return-breakdown";
import { CityPerformance } from "@/components/reports/city-performance";
import { PeriodComparison } from "@/components/reports/period-comparison";
import { SourcePerformance } from "@/components/reports/source-performance";
import { AttentionFlagsSummary } from "@/components/reports/attention-flags-summary";
import { splitReportOrders } from "@/lib/analytics/report-order-facts";
import {
    calculateAttentionFlags, calculateCityPerformance, calculateContactAttempts, calculateKPIs,
    calculateRejectionReasons, calculateReturnAnalytics, calculateStatusFlow, calculateTimeAnalysis,
} from "@/lib/analytics/reports-calculations";
import { calculatePeriodComparison, calculateSourcePerformance } from "@/lib/analytics/source-metrics";
import { buildReportFixtures } from "./reports-fixtures";

const end = new Date("2026-10-31T20:00:00Z");
const range = { from: new Date(end.getTime() - 30 * 86400000), to: end };
const rows = buildReportFixtures(end, 60, 700);
const { current, previous, returns } = splitReportOrders(rows, range);

function Reports({ rows: source = rows }: { rows?: typeof rows } = {}) {
    const { current, previous, returns } = splitReportOrders(source, range);
    return (
        <LanguageProvider>
            <div className="p-8 space-y-8 bg-[var(--background)]" style={{ width: 1440 }}>
                <AttentionFlagsSummary data={calculateAttentionFlags(current)} />
                <KPICards metrics={calculateKPIs(current, previous)} />
                <StatusFlowDiagram data={calculateStatusFlow(current)} />
                <div className="grid grid-cols-3 gap-6">
                    <ContactHeatmap data={calculateContactAttempts(current)} />
                    <TimeAnalysis data={calculateTimeAnalysis(current)} />
                    <RejectionBreakdown data={calculateRejectionReasons(current)} />
                </div>
                <ReturnBreakdown data={calculateReturnAnalytics(returns, current)} />
                <CityPerformance data={calculateCityPerformance(current)} />
                <PeriodComparison data={calculatePeriodComparison(current, previous)} currentRange={range} />
                <SourcePerformance data={calculateSourcePerformance(current)} />
            </div>
        </LanguageProvider>
    );
}

const meta: Meta = { title: "Reports/Full page", component: Reports, parameters: { layout: "fullscreen" } };
export default meta;
export const Default: StoryObj = {};

// A merchant on day three: a handful of orders, no rejections, no returns, no previous period.
const sparse = rows.filter((r) => r.status === "delivered" && !r.is_return && new Date(r.created_at) > new Date(end.getTime() - 3 * 86400000)).slice(0, 4);
export const Sparse: StoryObj = { render: () => <Reports rows={sparse} /> };

// ---- Team / Batch / Channel cards ----
import { TrueEmployeePerformance } from "@/components/reports/true-employee-performance";
import { BatchAnalytics } from "@/components/reports/batch-analytics";
import { ChannelPerformance } from "@/components/reports/channel-performance";
import { calculateChannelPerformance } from "@/lib/analytics/channel-metrics";
import type { EmployeeActivityMetrics } from "@/hooks/use-employee-metrics";
import type { BatchMetrics, BatchAnalyticsSummary } from "@/hooks/use-batch-analytics";

const staff: EmployeeActivityMetrics[] = ["Mohammed", "Noor", "Karrar", "Ali2", "Sara"].map((name, i) => ({
    userId: `u${i}`, userEmail: `${name.toLowerCase()}@x.iq`, displayName: name,
    totalActions: 900 - i * 170, ordersCreated: 120 - i * 20, statusChanges: 400 - i * 60, ordersEdited: 90, ordersPrinted: 200,
    confirmedOrders: 210 - i * 30, deliveredOrders: 150 - i * 25, avgActionsPerDay: 31 - i * 5,
    mostRecentAction: new Date(), isOnline: i < 2, rank: i + 1,
}));
const batches: BatchMetrics[] = Array.from({ length: 5 }, (_, i) => ({
    id: `b${i}`, name: `Batch ${i + 1}`, createdAt: new Date(end.getTime() - i * 86400000 * 3), orderCount: 40 + i * 7,
    totalValue: 1_800_000 + i * 240_000, cities: ["Baghdad", "Basra", "Erbil"], deliveryRate: 82 - i * 9, rejectionRate: 8 + i * 3,
    avgDeliveryTime: 0, status: (["completed", "mixed", "in_progress", "pending", "completed"] as const)[i],
}));
const summary: BatchAnalyticsSummary = {
    totalBatches: 5, totalOrders: 270, totalValue: 10_000_000, avgOrdersPerBatch: 54, avgBatchValue: 2_000_000, avgDeliveryRate: 64,
    topCities: [{ city: "Baghdad", count: 120 }, { city: "Basra", count: 80 }, { city: "Erbil", count: 70 }], batchesByDay: [],
};
const channel = calculateChannelPerformance(
    [...Array(40)].map((_, i) => ({ ad_channel: i % 3 ? "instagram" : "tiktok", status: i % 4 ? "delivered" : "rejected", price: 25000 })), true);

function Operations() {
    return (
        <LanguageProvider>
            <div className="p-8 space-y-8 bg-[var(--background)]" style={{ width: 1440 }}>
                <div className="grid grid-cols-2 gap-6">
                    <TrueEmployeePerformance data={staff} loading={false} error={null} onRefresh={() => {}} />
                    <SourcePerformance data={calculateSourcePerformance(current)} />
                </div>
                <ChannelPerformance data={channel} loading={false} error={null} onRetry={() => {}} />
                <BatchAnalytics batches={batches} summary={summary} loading={false} error={null} onRefresh={() => {}} />
            </div>
        </LanguageProvider>
    );
}
export const Operations_: StoryObj = { render: () => <Operations />, name: "Operations" };
