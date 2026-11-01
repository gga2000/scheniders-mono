import { describe, expect, it } from "vitest";
import {
    attributionCoverage,
    buildDailySeries,
    META_URL_PARAMETERS,
    pctChange,
    previousRange,
    rangeForPreset,
    rangeLength,
} from "./ads-report";
import { parseAdUrlParams } from "@scheniders/shared/ad-attribution";

describe("ranges", () => {
    it("builds presets ending today in Baghdad days", () => {
        expect(rangeForPreset("today", "2026-11-01")).toEqual({ since: "2026-11-01", until: "2026-11-01" });
        expect(rangeForPreset("yesterday", "2026-11-01")).toEqual({ since: "2026-10-31", until: "2026-10-31" });
        expect(rangeForPreset("7", "2026-11-01")).toEqual({ since: "2026-10-26", until: "2026-11-01" });
    });

    it("compares to the same-length window right before", () => {
        const r = rangeForPreset("7", "2026-11-01");
        expect(previousRange(r)).toEqual({ since: "2026-10-19", until: "2026-10-25" });
        expect(rangeLength(previousRange(r))).toBe(7);
        expect(previousRange({ since: "2026-11-01", until: "2026-11-01" })).toEqual({ since: "2026-10-31", until: "2026-10-31" });
    });

    it("pctChange has no answer without a base", () => {
        expect(pctChange(150, 100)).toBe(50);
        expect(pctChange(50, 100)).toBe(-50);
        expect(pctChange(5, 0)).toBeNull();
    });
});

describe("buildDailySeries", () => {
    it("zero-fills quiet days", () => {
        const s = buildDailySeries(
            { since: "2026-10-30", until: "2026-11-01" },
            new Map([["2026-10-30", 5000]]),
            new Map([["2026-11-01", 3]]),
            new Map(),
        );
        expect(s).toEqual([
            { date: "2026-10-30", spendIqd: 5000, orders: 0, delivered: 0 },
            { date: "2026-10-31", spendIqd: 0, orders: 0, delivered: 0 },
            { date: "2026-11-01", spendIqd: 0, orders: 3, delivered: 0 },
        ]);
    });
});

describe("attributionCoverage", () => {
    it("counts ad orders that carry an ad id", () => {
        const row = (ad_channel: string | null, attribution: unknown) => ({ created_at: "", status: "new", ad_channel, attribution });
        const c = attributionCoverage([
            row("facebook", { adId: "1" }),
            row("instagram", { campaign: "x" }),
            row(null, null),
            row("facebook", { adId: " " }),
        ]);
        expect(c).toEqual({ adOrders: 3, withAdId: 1, pct: 33 });
        expect(attributionCoverage([]).pct).toBeNull();
    });
});

describe("META_URL_PARAMETERS", () => {
    it("is read back by the storefront parser", () => {
        const filled = META_URL_PARAMETERS.replace("{{site_source_name}}", "ig")
            .replace("{{placement}}", "Instagram_Reels")
            .replace("{{campaign.name}}", "Eid")
            .replace("{{ad.name}}", "V1")
            .replace("{{ad.id}}", "11")
            .replace("{{adset.id}}", "22")
            .replace("{{campaign.id}}", "33");
        expect(parseAdUrlParams(new URLSearchParams(filled))).toMatchObject({
            channel: "instagram",
            medium: "Instagram_Reels",
            campaign: "Eid",
            adId: "11",
            term: "22",
            campaignId: "33",
        });
    });
});
