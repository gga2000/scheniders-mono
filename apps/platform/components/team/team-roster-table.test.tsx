import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import type { EmployeeStats } from "@/lib/team-types";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: Record<string, string | number>) =>
            vars ? `${key}:${Object.values(vars).join(",")}` : key,
    }),
}));

import { TeamRosterTable } from "./team-roster-table";

const NOW = Date.parse("2026-10-31T12:00:00Z");

function member(id: string, name: string, actions: number, overrides: Partial<EmployeeStats> = {}): EmployeeStats {
    return {
        user_id: id,
        user_email: `${id}@x.com`,
        display_name: name,
        avatar_url: null,
        role: "employee",
        is_active: true,
        last_login_at: null,
        total_actions: actions,
        status_changes: 0,
        orders_created: 0,
        orders_printed: 0,
        orders_edited: 0,
        logins: 0,
        ...overrides,
    };
}

afterEach(cleanup);

// Each row's first button is the member cell: avatar initial, then the name.
function memberButtons() {
    return screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("button")[0]);
}

function rowOrder(names: string[]) {
    return memberButtons().map((b) => names.find((n) => b.textContent?.includes(n)));
}

describe("TeamRosterTable", () => {
    const members = [member("a", "Zaid", 5), member("b", "Ali", 40), member("c", "Huda", 0)];

    it("sorts by actions, busiest first, and counts idle members", () => {
        render(<TeamRosterTable members={members} activeUserIds={new Set()} now={NOW} onSelect={() => {}} />);
        expect(rowOrder(["Ali", "Zaid", "Huda"])).toEqual(["Ali", "Zaid", "Huda"]);
        expect(screen.getByText("team.roster.summary:3,1")).toBeTruthy();
        expect(screen.getByText("team.roster.noActivity")).toBeTruthy();
    });

    it("re-sorts by name when the member header is clicked", () => {
        render(<TeamRosterTable members={members} activeUserIds={new Set()} now={NOW} onSelect={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "team.roster.member" }));
        expect(rowOrder(["Ali", "Zaid", "Huda"])).toEqual(["Ali", "Huda", "Zaid"]);
    });

    it("marks realtime-active and recently logged-in members", () => {
        render(
            <TeamRosterTable
                members={[member("a", "Zaid", 5), member("b", "Ali", 40, { last_login_at: "2026-10-31T11:55:00Z" })]}
                activeUserIds={new Set(["a"])}
                now={NOW}
                onSelect={() => {}}
            />,
        );
        expect(screen.getByText("team.roster.workingNow")).toBeTruthy();
        expect(screen.getByText("team.roster.online")).toBeTruthy();
    });

    it("selects a member by id", () => {
        const onSelect = vi.fn();
        render(<TeamRosterTable members={members} activeUserIds={new Set()} now={NOW} onSelect={onSelect} />);
        fireEvent.click(rowNamesButton("Huda"));
        expect(onSelect).toHaveBeenCalledWith("c");
    });
});

function rowNamesButton(name: string): HTMLElement {
    const button = memberButtons().find((b) => b.textContent?.includes(name));
    if (!button) throw new Error(`no row for ${name}`);
    return button;
}
