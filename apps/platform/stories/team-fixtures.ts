import type { EmployeeStats } from "@/types/team";
import type { ActivityAction, ActivityLogEntry } from "@/types/activity";
import type { TeamRollup } from "@/lib/team-insights";
import { teamInsightsWindow } from "@/lib/team-time-window";

/** Shared sample data for the /team stories: a small perfume store's week. */
export const NOW = Date.now();
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

export const members: EmployeeStats[] = [
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

export const activities: ActivityLogEntry[] = [
    act("a1", "order.status_change", "moh@perfumes.com", 1, { order_id: "4261031044", from_status: "contacted", to_status: "confirmed" }),
    act("a2", "order.create", "ali@perfumes.com", 4, { order_id: "4261031045" }),
    act("a3", "order.print", "hassan.packing@perfumes.com", 9, { order_id: "4261031040" }),
    act("a4", "order.status_change", "moh@perfumes.com", 14, { order_id: "4261031038", from_status: "confirmed", to_status: "cancelled", reason: "ألغى العميل" }),
    act("a7", "mcp.tool_call", "ali@perfumes.com", 20, { tool: "sales_summary" }),
    act("a5", "order.edit", "zainab@perfumes.com", 33, { order_id: "4261031031" }),
    act("a6", "user.login", "zainab@perfumes.com", 180),
];

export const trend = (vals: number[]) => vals.map((value, i) => ({ day: `2026-10-${25 + i}`, value }));
export const stat = (current: number, previous: number) => ({ current, trend: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null });


/** What team_activity_rollup returns for the sample week (Baghdad days, busiest mid-week). */
const weekDays = teamInsightsWindow("week", NOW).dayKeys;
export const weekRollup: TeamRollup = {
    by_day: weekDays.map((day, i) => {
        const total = [98, 140, 121, 160, 133, 110, 130][i];
        return { day, total_actions: total, orders_created: Math.round(total * 0.23), status_changes: Math.round(total * 0.6), orders_printed: Math.round(total * 0.14) };
    }),
    by_hour: [[9, 40], [10, 88], [11, 120], [12, 96], [13, 70], [14, 64], [15, 82], [16, 110], [17, 90], [18, 61], [19, 40], [20, 21], [21, 10]].map(([hour, n]) => ({ hour, n })),
    by_action: [
        { action: "order.status_change", n: 538 },
        { action: "order.create", n: 206 },
        { action: "order.print", n: 122 },
        { action: "order.edit", n: 26 },
        { action: "mcp.tool_call", n: 31 },
        { action: "user.login", n: 30 },
    ],
};

export const employeesAdapter = members.map((m) => ({
    userId: m.user_id,
    email: m.user_email,
    displayName: m.display_name,
    avatarUrl: m.avatar_url,
    role: m.role,
    isOnline: m.user_id === "u1" || m.user_id === "u2",
    lastLoginAt: m.last_login_at,
    totalActions: m.total_actions,
    ordersCreated: m.orders_created,
    statusChanges: m.status_changes,
    ordersPrinted: m.orders_printed,
    ordersEdited: m.orders_edited,
    logins: m.logins,
}));
