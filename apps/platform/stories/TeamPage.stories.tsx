import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { TeamPageHeader } from "@/components/team/team-page-header";
import { TeamViewTabs, type TeamViewMode } from "@/components/team/team-view-tabs";
import { TeamStatStrip } from "@/components/team/team-stat-strip";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { TeamActivityFeed } from "@/components/team/team-activity-feed";
import type { TeamTimeRange } from "@/lib/team-time-window";
import type { EmployeeStats } from "@/types/team";
import type { ActivityAction, ActivityLogEntry } from "@/types/activity";

/**
 * /team "Team" tab with a week of data from a small perfume store: five people, one of them
 * idle all week, one working right now. Rendered from the real components; only the data
 * hooks are replaced by fixtures.
 */
const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const member = (over: Partial<EmployeeStats> & { user_id: string; user_email: string }): EmployeeStats => ({
    display_name: null,
    avatar_url: null,
    role: "employee",
    is_active: true,
    last_login_at: null,
    total_actions: 0,
    status_changes: 0,
    orders_created: 0,
    orders_printed: 0,
    orders_edited: 0,
    logins: 0,
    ...over,
});

const members: EmployeeStats[] = [
    member({ user_id: "u1", user_email: "ali@perfumes.com", display_name: "علي واثق", role: "owner", last_login_at: minutesAgo(5), total_actions: 412, status_changes: 260, orders_created: 98, orders_printed: 41, orders_edited: 13, logins: 9 }),
    member({ user_id: "u2", user_email: "moh@perfumes.com", display_name: "محمد كريم", last_login_at: minutesAgo(2), total_actions: 287, status_changes: 190, orders_created: 61, orders_printed: 30, orders_edited: 6, logins: 12 }),
    member({ user_id: "u3", user_email: "zainab@perfumes.com", display_name: "زينب حسين", last_login_at: minutesAgo(180), total_actions: 154, status_changes: 88, orders_created: 47, orders_printed: 12, orders_edited: 7, logins: 6 }),
    member({ user_id: "u4", user_email: "hassan.packing@perfumes.com", display_name: "حسن (التغليف)", role: "viewer", last_login_at: minutesAgo(60 * 26), total_actions: 39, status_changes: 0, orders_created: 0, orders_printed: 39, logins: 3 }),
    member({ user_id: "u5", user_email: "sara@perfumes.com", display_name: null, last_login_at: minutesAgo(60 * 24 * 9), total_actions: 0 }),
];

const act = (id: string, action: ActivityAction, user: string, m: number, details: Record<string, unknown> = {}): ActivityLogEntry => ({
    id, action, user_id: members.find((x) => x.user_email === user)?.user_id ?? null, user_email: user, entity_type: "order", entity_id: null, details,
    ip_address: null, user_agent: null, created_at: minutesAgo(m),
});

const activities: ActivityLogEntry[] = [
    act("a1", "order.status_change", "moh@perfumes.com", 1, { order_id: "4261031044", from_status: "contacted", to_status: "confirmed" }),
    act("a2", "order.create", "ali@perfumes.com", 4, { order_id: "4261031045" }),
    act("a3", "order.print", "hassan.packing@perfumes.com", 9, { order_id: "4261031040" }),
    act("a4", "order.status_change", "moh@perfumes.com", 14, { order_id: "4261031038", from_status: "confirmed", to_status: "cancelled", reason: "ألغى العميل" }),
    act("a7", "mcp.tool_call", "ali@perfumes.com", 20, { tool: "sales_summary" }),
    act("a5", "order.edit", "zainab@perfumes.com", 33, { order_id: "4261031031" }),
    act("a6", "user.login", "zainab@perfumes.com", 180),
];

const trend = (vals: number[]) => vals.map((value, i) => ({ day: `2026-10-${25 + i}`, value }));
const stat = (current: number, previous: number) => ({ current, trend: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null });

function TeamTab() {
    const [range, setRange] = useState<TeamTimeRange>("week");
    const [view, setView] = useState<TeamViewMode>("team");
    const [filter, setFilter] = useState("all");
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <div className="min-h-screen px-4 py-5 sm:p-6 max-w-7xl mx-auto space-y-6 pb-24">
                <TeamPageHeader isConnected refreshing={false} onRefresh={() => undefined} timeRange={range} onTimeRangeChange={setRange} />
                <TeamViewTabs value={view} onChange={setView} />
                <div className="space-y-6">
                    <TeamStatStrip
                        range={range}
                        totalActions={stat(892, 760)}
                        ordersCreated={stat(206, 221)}
                        statusChanges={stat(538, 470)}
                        ordersPrinted={stat(122, 0)}
                        actionsByDay={trend([98, 140, 121, 160, 133, 110, 130])}
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <TeamRosterTable members={members} activeUserIds={new Set(["u2"])} now={NOW} onSelect={() => undefined} />
                        </div>
                        <div className="lg:col-span-1">
                            <TeamActivityFeed
                                feed={{ activities, isLoading: false, isLoadingMore: false, hasMore: true, totalCount: 892, error: null, loadMore: async () => undefined }}
                                actionFilter={filter}
                                onActionFilterChange={setFilter}
                                isNew={() => false}
                                resolveName={(e) => members.find((m) => m.user_id === e.user_id)?.display_name ?? e.user_email?.split("@")[0] ?? null}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const meta: Meta<typeof TeamTab> = {
    title: "Team/TeamPage",
    component: TeamTab,
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Week: StoryObj<typeof TeamTab> = {};
