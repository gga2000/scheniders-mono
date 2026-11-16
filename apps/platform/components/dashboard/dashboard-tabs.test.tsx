/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, renderHook, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DashboardTabs, useDashboardTab } from "./dashboard-tabs";

afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/dashboard");
});

describe("DashboardTabs", () => {
    it("shows the four sections and marks the open one", () => {
        const onChange = vi.fn();
        render(<LanguageProvider><DashboardTabs value="delivery" onChange={onChange} /></LanguageProvider>);
        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual(["نظرة عامة", "التوصيل", "الفريق", "المنتجات"]);
        expect(tabs[1].getAttribute("aria-selected")).toBe("true");
        fireEvent.click(tabs[3]);
        expect(onChange).toHaveBeenCalledWith("products");
    });
});

describe("useDashboardTab", () => {
    it("opens the tab named in the address and writes the choice back", () => {
        window.history.replaceState(null, "", "/dashboard?tab=team");
        const { result } = renderHook(() => useDashboardTab());
        expect(result.current[0]).toBe("team");
        act(() => result.current[1]("overview"));
        expect(window.location.search).toBe("");
        act(() => result.current[1]("products"));
        expect(window.location.search).toBe("?tab=products");
    });

    it("ignores an unknown tab", () => {
        window.history.replaceState(null, "", "/dashboard?tab=nope");
        const { result } = renderHook(() => useDashboardTab());
        expect(result.current[0]).toBe("overview");
    });
});
