import { describe, expect, it } from "vitest";
import { groupAdsByAdset, isFatigued, type AdInsightDay } from "./ads-creatives";

function day(over: Partial<AdInsightDay> & Pick<AdInsightDay, "spend_date">): AdInsightDay {
    return {
        ad_id: "a1", ad_name: "Reel A", adset_id: "s1", adset_name: "Baghdad", campaign_id: "c1",
        spend_iqd: 10_000, impressions: 2000, clicks: 40, results: 1, frequency: 1.2, ...over,
    };
}

const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];

describe("isFatigued", () => {
    it("flags rising frequency with falling CTR", () => {
        const days = dates.map((d, i) => day(i < 3 ? { spend_date: d } : { spend_date: d, frequency: 1.6, clicks: 20 }));
        expect(isFatigued(days)).toBe(true);
    });
    it("does not flag steady numbers, thin history or too few impressions", () => {
        expect(isFatigued(dates.map((d) => day({ spend_date: d })))).toBe(false);
        expect(isFatigued(dates.slice(0, 4).map((d) => day({ spend_date: d, frequency: 3, clicks: 1 })))).toBe(false);
        const thin = dates.map((d, i) => day(i < 3 ? { spend_date: d, impressions: 100, clicks: 2 } : { spend_date: d, impressions: 100, clicks: 0, frequency: 3 }));
        expect(isFatigued(thin)).toBe(false);
    });
});

describe("groupAdsByAdset", () => {
    it("rolls days into ads and ad sets with CTR, CPM and weighted frequency", () => {
        const rows = [
            day({ spend_date: "2026-10-30", frequency: 1, impressions: 1000, clicks: 10, spend_iqd: 5000 }),
            day({ spend_date: "2026-10-31", frequency: 2, impressions: 3000, clicks: 60, spend_iqd: 15_000, ad_name: "Reel A v2" }),
            day({ spend_date: "2026-10-31", ad_id: "a2", ad_name: "Photo", adset_id: "s2", adset_name: "Basra", spend_iqd: 40_000, impressions: 8000, clicks: 80 }),
        ];
        const sets = groupAdsByAdset(rows);
        expect(sets.map((s) => s.adsetId)).toEqual(["s2", "s1"]);
        const ad = sets[1].ads[0];
        expect(ad.adName).toBe("Reel A v2");
        expect(ad.spendIqd).toBe(20_000);
        expect(ad.ctr).toBeCloseTo(1.75);
        expect(ad.cpm).toBe(5000);
        expect(ad.frequency).toBeCloseTo(1.75);
        expect(sets[0].cpm).toBe(5000);
    });
    it("returns null rates with no impressions", () => {
        const sets = groupAdsByAdset([day({ spend_date: "2026-10-31", impressions: 0, clicks: 0, spend_iqd: 0 })]);
        expect(sets[0].ads[0].ctr).toBeNull();
        expect(sets[0].ads[0].cpm).toBeNull();
        expect(sets[0].ads[0].frequency).toBeNull();
    });
});
