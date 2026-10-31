import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { GoalBoard, type GoalRow } from "./goal-board";

afterEach(cleanup);

const row = (id: string, current: number | null, target = 10): GoalRow => ({
    goal: { id, employeeId: "u1", type: "daily", metric: "totalActions", target, createdAt: "" },
    name: "Mohammed",
    current,
});

function renderBoard(rows: GoalRow[], onAdd = vi.fn(async () => true), onDelete = vi.fn()) {
    render(
        <LanguageProvider>
            <GoalBoard rows={rows} employees={[{ userId: "u1", name: "Mohammed" }]} loading={false} goalsFailed={false} progressFailed={false} onAdd={onAdd} onDelete={onDelete} />
        </LanguageProvider>,
    );
    return { onAdd, onDelete };
}

describe("GoalBoard", () => {
    it("counts met goals and caps the bar at the target", () => {
        renderBoard([row("a", 12), row("b", 4)]);
        const bars = screen.getAllByRole("progressbar");
        expect(bars[0].getAttribute("aria-valuenow")).toBe("12");
        expect(screen.getByText("40%")).toBeTruthy();
    });

    it("asks before deleting", () => {
        const { onDelete } = renderBoard([row("a", 1)]);
        const trash = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label"));
        if (!trash) throw new Error("no delete button");
        fireEvent.click(trash);
        expect(onDelete).not.toHaveBeenCalled();
        const confirm = screen.getAllByRole("button").find((b) => b.className.includes("bg-rose-600"));
        if (!confirm) throw new Error("no confirm button");
        fireEvent.click(confirm);
        expect(onDelete).toHaveBeenCalledWith("a");
    });

    it("won't save without a member or a whole-number target", async () => {
        const { onAdd } = renderBoard([]);
        const newBtn = screen.getAllByRole("button")[0];
        fireEvent.click(newBtn);
        const submit = screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit");
        if (!submit) throw new Error("no submit");
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "u1" } });
        fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2.5" } });
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "25" } });
        expect((submit as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(submit);
        await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith({ employeeId: "u1", type: "daily", metric: "totalActions", target: 25 }));
    });
});
