import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EmployeeDrawerPanel, type EmployeeDrawerTab } from "@/components/team/employee-drawer-panel";
import { EmployeeSalarySummary } from "@/components/team/employee-salary-summary";
import { useWorkSessions } from "@/components/team/hooks/use-work-sessions";
import { buildTeamInsights } from "@/lib/team-insights";
import { teamInsightsWindow } from "@/lib/team-time-window";
import { activities, employeesAdapter, weekRollup } from "./team-fixtures";

/** The member drawer over the Team tab, for Mohammed, with each tab reachable. */
const employee = employeesAdapter[1];
const own = activities.filter((a) => a.user_id === employee.userId);
const insights = buildTeamInsights(weekRollup, teamInsightsWindow("week").dayKeys);

function Drawer({ initialTab }: { initialTab: EmployeeDrawerTab }) {
    const [tab, setTab] = useState<EmployeeDrawerTab>(initialTab);
    const sessions = useWorkSessions(own, employee.userId);
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <EmployeeDrawerPanel
                employee={employee}
                range="week"
                tab={tab}
                onTabChange={setTab}
                feed={{ activities: own, isLoading: false, hasMore: false, isLoadingMore: false, loadMore: async () => undefined }}
                sessions={sessions}
                charts={{ insights, loading: false, failed: false }}
                salary={
                    <EmployeeSalarySummary
                        rate={{ baseMonthlySalary: 750000, perOrderBonus: 1000, source: "employee_config" }}
                        pending={[
                            { id: "a1", kind: "advance", amount: 100000, reason: null },
                            { id: "b1", kind: "bonus", amount: 25000, reason: "أفضل موظف هذا الأسبوع" },
                        ]}
                        onEdit={() => undefined}
                    />
                }
                telegram={<p className="text-sm">Telegram</p>}
                onClose={() => undefined}
                onNavigate={() => undefined}
                hasPrev
                hasNext
            />
        </div>
    );
}

const meta: Meta<typeof Drawer> = {
    title: "Team/Drawer",
    component: Drawer,
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Activity: StoryObj<typeof Drawer> = { args: { initialTab: "activity" } };
export const Hours: StoryObj<typeof Drawer> = { args: { initialTab: "sessions" } };
export const Charts: StoryObj<typeof Drawer> = { args: { initialTab: "analytics" } };
export const Salary: StoryObj<typeof Drawer> = { args: { initialTab: "salary" } };
