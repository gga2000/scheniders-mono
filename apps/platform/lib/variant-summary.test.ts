/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import type {
    AudienceSegment,
    Experiment,
    VariantCondition,
} from "@scheniders/shared";

import { summarizeVariantConditions } from "./variant-summary";

describe("summarizeVariantConditions", () => {
    it("time_window with start + end renders short month/day range", () => {
        const c: VariantCondition = {
            kind: "time_window",
            start_iso: "2026-03-10T08:00:00Z",
            end_iso: "2026-04-09T08:00:00Z",
            timezone: "Asia/Baghdad",
        };
        const out = summarizeVariantConditions([c], "en");
        expect(out).toContain("Mar");
        expect(out).toContain("Apr");
        // Should NOT include raw timezone string or ISO chunks
        expect(out).not.toContain("Asia/Baghdad");
        expect(out).not.toContain("2026-");
        expect(out).not.toContain("T08:00");
    });

    it("breakpoint mobile renders 'On phones'", () => {
        const c: VariantCondition = { kind: "breakpoint", values: ["mobile"] };
        expect(summarizeVariantConditions([c], "en")).toBe("On phones");
    });

    it("governorate single → 'In Baghdad'", () => {
        const c: VariantCondition = { kind: "governorate", values: ["BG"] };
        expect(summarizeVariantConditions([c], "en")).toBe("In Baghdad");
    });

    it("governorate multiple joins with '+'", () => {
        const c: VariantCondition = {
            kind: "governorate",
            values: ["BG", "BA"],
        };
        const out = summarizeVariantConditions([c], "en");
        expect(out).toContain("Baghdad");
        expect(out).toContain("Basra");
        expect(out.startsWith("In ")).toBe(true);
    });

    it("locale renders 'When viewing in Arabic'", () => {
        const c: VariantCondition = { kind: "locale", values: ["ar"] };
        const out = summarizeVariantConditions([c], "en");
        expect(out).toContain("Arabic");
        expect(out).toContain("viewing");
    });

    it("audience looks up segment name", () => {
        const c: VariantCondition = { kind: "audience", segment_id: "seg-1" };
        const segments: AudienceSegment[] = [
            { id: "seg-1", name: "New customers", rules: [], combine: "all" },
        ];
        const out = summarizeVariantConditions([c], "en", { segments });
        expect(out).toBe("For: New customers");
    });

    it("ab_test looks up experiment name + arm label", () => {
        const c: VariantCondition = {
            kind: "ab_test",
            experiment_id: "exp-1",
            arm: "var-b",
        };
        const experiments: Experiment[] = [
            {
                id: "exp-1",
                name: "Ramadan hero test",
                status: "running",
                primary_metric: "orders",
                arms: [
                    { id: "control", label: "Control", traffic_pct: 50 },
                    { id: "var-b", label: "Arm B", traffic_pct: 50 },
                ],
            },
        ];
        const out = summarizeVariantConditions([c], "en", { experiments });
        expect(out).toContain("Ramadan hero test");
        expect(out).toContain("Arm B");
        expect(out.startsWith("Test: ")).toBe(true);
    });

    it("page condition renders 'On Home, Product'", () => {
        const c: VariantCondition = {
            kind: "page",
            values: ["home", "product"],
        };
        const out = summarizeVariantConditions([c], "en");
        expect(out).toContain("Home");
        expect(out).toContain("Product");
    });

    it("empty conditions falls back to 'Always shown'", () => {
        expect(summarizeVariantConditions([], "en")).toBe("Always shown");
    });
});
