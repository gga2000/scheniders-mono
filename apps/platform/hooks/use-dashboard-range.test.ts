// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readDashboardRange, useDashboardRange } from "./use-dashboard-range";
import { revenueWindowFor } from "@/lib/analytics/dashboard-bento";

afterEach(() => window.history.replaceState(null, "", "/dashboard"));

describe("the dashboard's period in the address", () => {
    it("reads only the four periods", () => {
        expect(readDashboardRange("30d")).toBe("30d");
        expect(readDashboardRange("90d")).toBeNull();
        expect(readDashboardRange(null)).toBeNull();
    });

    it("opens on the period the link names, so Back from Orders keeps it", () => {
        window.history.replaceState(null, "", "/dashboard?tab=delivery&range=30d");
        const { result } = renderHook(() => useDashboardRange());
        expect(result.current[0]).toBe("30d");
    });

    it("writes the chosen period into the address, and drops it for the default", () => {
        window.history.replaceState(null, "", "/dashboard?tab=team");
        const { result } = renderHook(() => useDashboardRange());
        expect(result.current[0]).toBe("7d");
        act(() => result.current[1]("all"));
        expect(result.current[0]).toBe("all");
        expect(window.location.search).toBe("?tab=team&range=all");
        act(() => result.current[1]("7d"));
        expect(window.location.search).toBe("?tab=team");
    });

    it("gives the revenue card the header's window", () => {
        expect(revenueWindowFor("today")).toBe(7);
        expect(revenueWindowFor("7d")).toBe(7);
        expect(revenueWindowFor("30d")).toBe(30);
        expect(revenueWindowFor("all")).toBe(30);
    });
});
