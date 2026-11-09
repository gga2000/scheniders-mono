/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScreenHeader } from "./screen-header";
import { getSettingLabel } from "./page-tree";
import { ScreenSaveStateProvider } from "./screen-save-state";

afterEach(() => {
    cleanup();
});

describe("ScreenHeader", () => {
    it("shows the title, subtitle and actions, and the back arrow calls onBack", () => {
        const onBack = vi.fn();
        render(
            <ScreenHeader
                setting="bundles"
                subtitle="اشترِ معاً"
                onBack={onBack}
                backTestId="bundles-close"
                actions={<button type="button">إضافة</button>}
            />,
        );
        // The title is the rail's name for the screen (English when no editor locale is provided).
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(getSettingLabel("bundles", "en"));
        expect(screen.getByText("اشترِ معاً")).toBeTruthy();
        expect(screen.getByRole("button", { name: "إضافة" })).toBeTruthy();
        fireEvent.click(screen.getByTestId("bundles-close"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("has no back arrow when the screen gives no way back", () => {
        render(<ScreenHeader setting="brand_kit" />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("uses the left rail's tint for the screen", () => {
        render(<ScreenHeader setting="health" />);
        const tile = screen.getByTestId("screen-header").querySelector(".sb-tile");
        expect(tile?.className).toContain("sb-tile--story");
    });

    it("shows no save strip while saves land", () => {
        render(
            <ScreenSaveStateProvider value={{ failed: false, retry: vi.fn() }}>
                <ScreenHeader setting="bundles" />
            </ScreenSaveStateProvider>,
        );
        expect(screen.queryByTestId("screen-save-failed")).toBeNull();
    });

    it("shows a failed save under the title, and retry saves again", () => {
        const retry = vi.fn();
        render(
            <ScreenSaveStateProvider value={{ failed: true, retry }}>
                <ScreenHeader setting="bundles" />
            </ScreenSaveStateProvider>,
        );
        expect(screen.getByRole("alert").textContent).toBeTruthy();
        fireEvent.click(screen.getByTestId("screen-save-retry"));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
