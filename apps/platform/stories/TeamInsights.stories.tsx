import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { TeamAnalyticsTab } from "@/components/team/team-analytics-tab";
import { EmployeeComparison } from "@/components/team/employee-comparison";
import { buildTeamInsights } from "@/lib/team-insights";
import { teamInsightsWindow } from "@/lib/team-time-window";
import { employeesAdapter, weekRollup } from "./team-fixtures";

const insights = buildTeamInsights(weekRollup, teamInsightsWindow("week").dayKeys);
const quietWeek = buildTeamInsights({ ...weekRollup, by_day: [], by_hour: [], by_action: [] }, teamInsightsWindow("week").dayKeys);

/** /team "Insights" tab with a week of sample history. */
function Insights() {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <TeamAnalyticsTab range="week" insights={insights} loading={false} failed={false} />
                <EmployeeComparison employees={employeesAdapter} />
            </div>
        </div>
    );
}

const meta: Meta<typeof Insights> = {
    title: "Team/Insights",
    component: Insights,
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Week: StoryObj<typeof Insights> = {};

/** A week with no recorded actions: one plain message instead of three empty charts. */
export const QuietWeek: StoryObj<typeof Insights> = {
    render: () => (
        <div className="min-h-screen bg-[var(--background)] p-6 max-w-7xl mx-auto">
            <TeamAnalyticsTab range="week" insights={quietWeek} loading={false} failed={false} />
        </div>
    ),
};
