/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScreenHeader } from "./screen-header";

afterEach(() => {
    cleanup();
});

describe("ScreenHeader", () => {
    it("shows the title, subtitle and actions, and the back arrow calls onBack", () => {
        const onBack = vi.fn();
        render(
            <ScreenHeader
                setting="bundles"
                title="الحزم"
                subtitle="اشترِ معاً"
                onBack={onBack}
                backLabel="رجوع"
                backTestId="bundles-close"
                actions={<button type="button">إضافة</button>}
            />,
        );
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("الحزم");
        expect(screen.getByText("اشترِ معاً")).toBeTruthy();
        expect(screen.getByRole("button", { name: "إضافة" })).toBeTruthy();
        fireEvent.click(screen.getByTestId("bundles-close"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("has no back arrow when the screen gives no way back", () => {
        render(<ScreenHeader setting="brand_kit" title="هوية العلامة" />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("uses the left rail's tint for the screen", () => {
        render(<ScreenHeader setting="health" title="صحة المتجر" />);
        const tile = screen.getByTestId("screen-header").querySelector(".sb-tile");
        expect(tile?.className).toContain("sb-tile--story");
    });
});
