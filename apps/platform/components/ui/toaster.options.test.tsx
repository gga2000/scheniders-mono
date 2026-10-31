// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { Toaster } from "./toaster";
import { toast, dismissToast } from "@/hooks/use-toast";

/*
 * Callers pass a description either as a string or inside an options object,
 * and progress messages reuse one id. Both must reach the mounted Toaster.
 */
describe("Toaster — options object and fixed ids", () => {
    afterEach(() => {
        act(() => dismissToast());
        cleanup();
    });

    it("shows a description given in an options object", () => {
        render(<Toaster />);
        act(() => { toast.error("Order was modified elsewhere", { description: "Refreshing data", duration: 3000 }); });
        expect(screen.getByText("Order was modified elsewhere")).toBeTruthy();
        expect(screen.getByText("Refreshing data")).toBeTruthy();
    });

    it("updates the toast with the same id instead of stacking another", () => {
        render(<Toaster />);
        act(() => { toast.loading("Restoring products", { id: "restore-progress" }); });
        act(() => { toast.loading("Restoring orders", { id: "restore-progress" }); });
        expect(screen.queryByText("Restoring products")).toBeNull();
        expect(screen.getAllByText("Restoring orders")).toHaveLength(1);
    });
});
