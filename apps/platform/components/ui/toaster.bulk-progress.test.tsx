// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { Toaster } from "./toaster";
import { toast, updateToast, dismissToast } from "@/hooks/use-toast";

/*
 * The bulk status run talks to the operator only through this Toaster (the one
 * mounted in app/layout.tsx): a loading toast whose description counts up, then
 * an outcome toast carrying a retry action. Prove those shapes actually render.
 */
describe("Toaster — bulk progress messages", () => {
    afterEach(() => {
        act(() => dismissToast());
        cleanup();
    });

    it("shows the counting description as it is updated", () => {
        render(<Toaster />);
        let id = "";
        act(() => { id = toast.loading("Updating 12 orders...", "0 of 12"); });
        expect(screen.getByText("Updating 12 orders...")).toBeTruthy();
        expect(screen.getByText("0 of 12")).toBeTruthy();

        act(() => updateToast(id, { description: "10 of 12 · 1 failed" }));
        expect(screen.getByText("10 of 12 · 1 failed")).toBeTruthy();
    });

    it("renders a partial-failure toast with a working retry action", () => {
        const retry = vi.fn();
        render(<Toaster />);
        act(() => {
            toast({
                title: "2 of 12 orders were not updated",
                description: "2 orders changed by someone else — reload and try again. Affected: #1001, #1002",
                variant: "warning",
                action: { label: "Retry 2", onClick: retry },
            });
        });
        expect(screen.getByText("2 of 12 orders were not updated")).toBeTruthy();
        expect(screen.getByText(/Affected: #1001, #1002/)).toBeTruthy();
        fireEvent.click(screen.getByText("Retry 2"));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
