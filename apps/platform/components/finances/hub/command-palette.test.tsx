/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CommandPalette } from "./command-palette";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

function openPalette(onChangeTab = vi.fn()) {
    render(<CommandPalette onChangeTab={onChangeTab} onApplyPreset={vi.fn()} onExport={vi.fn()} onPrint={vi.fn()} />, {
        wrapper: LanguageProvider,
    });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    return onChangeTab;
}

describe("CommandPalette", () => {
    it("words every entry in Arabic, with no English leftovers or fake shortcut hints", () => {
        openPalette();
        expect(screen.getByText("تصدير العرض الحالي")).toBeTruthy();
        expect(screen.getByText("الفترة: اليوم")).toBeTruthy();
        expect(screen.queryByText("Export current view")).toBeNull();
        expect(screen.queryByText("T")).toBeNull();
    });

    it("filters by the translated label and selects with Enter", () => {
        const onChangeTab = openPalette();
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "الانتقال" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChangeTab).toHaveBeenCalledWith("overview");
    });
});
