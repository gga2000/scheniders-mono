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

function Reports() {
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
