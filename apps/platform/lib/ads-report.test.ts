import { describe, expect, it } from "vitest";
import {
    breakEvenCostPerDelivered,
    campaignVerdict,
    attributionCoverage,
    buildDailySeries,
    matchOrdersToCampaigns,
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

describe("matchOrdersToCampaigns", () => {
    const campaigns = [
        { campaignId: "11", campaignName: "Eid Sale" },
        { campaignId: "22", campaignName: "Perfumes  Ramadan" },
    ];
    const ad = (attribution: unknown) => ({ ad_channel: "facebook", attribution });

    it("prefers the campaign id, then the name ignoring case and spacing", () => {
        const r = matchOrdersToCampaigns(campaigns, [
            ad({ campaignId: "22", campaign: "whatever" }),
            ad({ campaign: "  eid   sale " }),
            ad({ campaign: "perfumes ramadan" }),
        ]);
        expect(r.byCampaign.get("22")).toBe(2);
        expect(r.byCampaign.get("11")).toBe(1);
        expect(r.unmatched).toBe(0);
    });

    it("counts unknown campaigns and missing refs as unmatched, and skips non-ad orders", () => {
        const r = matchOrdersToCampaigns(campaigns, [
            ad({ campaign: "Old campaign" }),
            ad({ source: "fb" }),
            ad(null),
            { ad_channel: null, attribution: null },
        ]);
        expect(r.byCampaign.size).toBe(0);
        expect(r.unmatched).toBe(3);
    });

    it("never guesses between two campaigns that share a name", () => {
        const dup = [
            { campaignId: "1", campaignName: "Sale" },
            { campaignId: "2", campaignName: "sale" },
        ];
        const r = matchOrdersToCampaigns(dup, [ad({ campaign: "Sale" }), ad({ campaignId: "2" })]);
        expect(r.byCampaign.get("2")).toBe(1);
        expect(r.byCampaign.get("1")).toBeUndefined();
        expect(r.unmatched).toBe(1);
    });
});

describe("break-even cost per delivered order", () => {
    it("is profit before marketing per delivered order", () => {
        // 1,000,000 net after 400,000 of marketing over 100 delivered = 14,000 each
        expect(breakEvenCostPerDelivered(1_000_000, 400_000, 100)).toBe(14_000);
    });
    it("is unknown with nothing delivered or nothing earned before ads", () => {
        expect(breakEvenCostPerDelivered(500, 0, 0)).toBeNull();
        expect(breakEvenCostPerDelivered(-900_000, 100_000, 40)).toBeNull();
    });
    it("judges a campaign at or under break-even as profitable", () => {
        expect(campaignVerdict(14_000, 14_000)).toBe("profitable");
        expect(campaignVerdict(14_001, 14_000)).toBe("losing");
        expect(campaignVerdict(null, 14_000)).toBe("unknown");
        expect(campaignVerdict(9_000, null)).toBe("unknown");
    });
});
