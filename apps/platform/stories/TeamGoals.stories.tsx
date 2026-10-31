import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { GoalBoard, type GoalRow } from "@/components/team/goal-board";
import type { Goal } from "@/lib/team-goals";

const goal = (id: string, employeeId: string, type: Goal["type"], metric: Goal["metric"], target: number): Goal => ({
    id, employeeId, type, metric, target, createdAt: "2026-10-01T00:00:00Z",
});

const rows: GoalRow[] = [
    { goal: goal("g1", "u2", "daily", "statusChanges", 40), name: "محمد كريم", current: 46 },
    { goal: goal("g2", "u3", "daily", "ordersCreated", 15), name: "زينب حسين", current: 9 },
    { goal: goal("g3", "u4", "daily", "ordersPrinted", 30), name: "حسن (التغليف)", current: 12 },
    { goal: goal("g4", "u2", "weekly", "totalActions", 300), name: "محمد كريم", current: 287 },
    { goal: goal("g5", "u3", "weekly", "ordersCreated", 60), name: "زينب حسين", current: 47 },
    { goal: goal("g6", "u1", "monthly", "totalActions", 1200), name: "علي واثق", current: 1340 },
];

const employees = [
    { userId: "u1", name: "علي واثق" },
    { userId: "u2", name: "محمد كريم" },
    { userId: "u3", name: "زينب حسين" },
    { userId: "u4", name: "حسن (التغليف)" },
];

function Goals({ rows: shown, loading = false }: { rows: GoalRow[]; loading?: boolean }) {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <div className="p-6 max-w-7xl mx-auto">
                <GoalBoard
                    rows={shown}
                    employees={employees}
                    loading={loading}
                    goalsFailed={false}
                    progressFailed={false}
                    onAdd={async () => true}
                    onDelete={() => undefined}
                />
            </div>
        </div>
    );
}

const meta: Meta<typeof Goals> = {
    title: "Team/Goals",
    component: Goals,
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const WithGoals: StoryObj<typeof Goals> = { args: { rows } };
export const Empty: StoryObj<typeof Goals> = { args: { rows: [] } };
