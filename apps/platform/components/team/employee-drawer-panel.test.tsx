import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: Record<string, string | number>) =>
            vars ? `${key}:${Object.values(vars).join(",")}` : key,
    }),
}));

import { EmployeeDrawerPanel } from "./employee-drawer-panel";
import type { WorkSessionStats } from "./hooks/use-work-sessions";

afterEach(cleanup);

const employee = {
    userId: "u2",
    email: "moh@perfumes.com",
    displayName: "Mohammed",
    avatarUrl: null,
    role: "employee",
    isOnline: true,
    lastLoginAt: null,
    totalActions: 287,
    ordersCreated: 61,
    statusChanges: 190,
    ordersPrinted: 30,
};

const sessions: WorkSessionStats = {
    sessions: [],
    dailySummaries: [],
    totalHours: 0,
    averageSessionMinutes: 0,
    longestSessionMinutes: 0,
    totalSessions: 0,
    averageActivitiesPerSession: 0,
};

function renderPanel(extra: Partial<Parameters<typeof EmployeeDrawerPanel>[0]> = {}) {
    const onClose = vi.fn();
    const onTabChange = vi.fn();
    render(
        <EmployeeDrawerPanel
            employee={employee}
            range="week"
            tab="activity"
            onTabChange={onTabChange}
            feed={{ activities: [], isLoading: false, hasMore: false, isLoadingMore: false, loadMore: async () => undefined }}
            sessions={sessions}
            charts={{ insights: null, loading: true, failed: false }}
            onClose={onClose}
            {...extra}
        />,
    );
    return { onClose, onTabChange };
}

describe("EmployeeDrawerPanel", () => {
    it("hides Salary and Telegram when the viewer is not an admin", () => {
        renderPanel();
        expect(screen.queryByText("team.drawer.salaryTab")).toBeNull();
        expect(screen.queryByText("team.drawer.telegramTab")).toBeNull();
    });

    it("shows the admin tabs and reports tab changes", () => {
        const { onTabChange } = renderPanel({ salary: <p>pay</p>, telegram: <p>tg</p> });
        fireEvent.click(screen.getByText("team.drawer.salaryTab"));
        expect(onTabChange).toHaveBeenCalledWith("salary");
    });

    it("shows the member's window totals and closes on Escape", () => {
        const { onClose } = renderPanel();
        expect(screen.getByText("287")).toBeTruthy();
        expect(screen.getByText("team.roster.role.employee")).toBeTruthy();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });
});
