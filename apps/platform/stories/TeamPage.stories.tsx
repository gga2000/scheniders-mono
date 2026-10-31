import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { TeamPageHeader } from "@/components/team/team-page-header";
import { TeamViewTabs, type TeamViewMode } from "@/components/team/team-view-tabs";
import { TeamStatStrip } from "@/components/team/team-stat-strip";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { TeamActivityFeed } from "@/components/team/team-activity-feed";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { NOW, activities, members, stat, trend } from "./team-fixtures";

/**
 * /team "Team" tab with a week of data from a small perfume store: five people, one of them
 * idle all week, one working right now. Rendered from the real components; only the data
 * hooks are replaced by fixtures.
 */
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
