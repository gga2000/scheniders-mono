/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    act,
} from "@testing-library/react";

import { SaveStatePill } from "./toolbar-controls";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

beforeEach(() => {
    vi.useFakeTimers();
});

describe("SaveStatePill — green pulse + retry", () => {
    it("shows the success pulse for 1.5s on saving → saved transition", () => {
        const { rerender } = render(
            <SaveStatePill state="saving" lastSavedAt={null} />,
        );
        const pill = screen.getByTestId("save-state-pill");
        expect(pill.getAttribute("data-state")).toBe("saving");
        expect(pill.getAttribute("data-pulse")).toBe("false");

        // Transition to saved → pulse window opens. The pill shows the
        // bare "Saved" label (success is conveyed by the check icon, not
        // a text glyph) and reports data-pulse="true".
        rerender(
            <SaveStatePill state="saved" lastSavedAt={new Date()} />,
        );
        const pillAfter = screen.getByTestId("save-state-pill");
        expect(pillAfter.getAttribute("data-pulse")).toBe("true");
        // During the pulse the label is the bare "Saved" (success is the
        // check icon, which contributes no text).
        expect(pillAfter.textContent?.trim()).toBe("Saved");

        // After 1.5s the pulse fades and the relative-time form returns.
        act(() => {
            vi.advanceTimersByTime(1600);
        });
        const pillFinal = screen.getByTestId("save-state-pill");
        expect(pillFinal.getAttribute("data-pulse")).toBe("false");
        // Label reverted to the relative-time form ("Saved <n> ago" /
        // "Saved just now") — no longer the bare pulse label.
        expect(pillFinal.textContent).toContain("Saved");
        expect(pillFinal.textContent?.trim()).not.toBe("Saved");
    });

    it("does not pulse when state goes idle → saved (only on a true saving transition)", () => {
        const { rerender } = render(
            <SaveStatePill state="idle" lastSavedAt={null} />,
        );
        rerender(<SaveStatePill state="saved" lastSavedAt={new Date()} />);
        const pill = screen.getByTestId("save-state-pill");
        expect(pill.getAttribute("data-pulse")).toBe("false");
    });

    it("renders the retry button in error state and calls onRetry when clicked", () => {
        const onRetry = vi.fn();
        render(
            <SaveStatePill
                state="error"
                lastSavedAt={null}
                onRetry={onRetry}
            />,
        );
        const retry = screen.getByTestId("save-state-retry");
        expect(retry).toBeTruthy();
        fireEvent.click(retry);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not render the retry button when onRetry is omitted", () => {
        render(<SaveStatePill state="error" lastSavedAt={null} />);
        expect(screen.queryByTestId("save-state-retry")).toBeNull();
    });

    it("does not render the retry button outside the error state", () => {
        render(
            <SaveStatePill
                state="saved"
                lastSavedAt={new Date()}
                onRetry={vi.fn()}
            />,
        );
        expect(screen.queryByTestId("save-state-retry")).toBeNull();
    });
});
