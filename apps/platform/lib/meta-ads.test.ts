import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCampaignInsights, MetaAdsError } from "./meta-ads";

const params = { adAccountId: "936978227928994", accessToken: "t".repeat(30), since: "2026-10-25", until: "2026-11-01" };

function mockFetch(body: unknown, ok = true) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 400, json: async () => body }));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchCampaignInsights", () => {
    it("maps rows and takes the largest purchase action, never the sum", async () => {
        mockFetch({
            data: [{
                date_start: "2026-10-31", campaign_id: "1", campaign_name: "Perfume", spend: "12.34",
                impressions: "1000", clicks: "50",
                actions: [{ action_type: "omni_purchase", value: "4" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" }, { action_type: "link_click", value: "50" }],
            }],
        });
        const rows = await fetchCampaignInsights(params);
        expect(rows).toEqual([{ spendDate: "2026-10-31", campaignId: "1", campaignName: "Perfume", spendUsd: 12.34, impressions: 1000, clicks: 50, results: 4 }]);
    });

    it("sends the token in a header, not the URL", async () => {
        mockFetch({ data: [] });
        await fetchCampaignInsights(params);
        const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
        expect(String(url)).not.toContain(params.accessToken);
        expect((init as RequestInit).headers).toEqual({ Authorization: `Bearer ${params.accessToken}` });
    });

    it("surfaces Meta's error message", async () => {
        mockFetch({ error: { message: "Invalid OAuth access token", code: 190 } }, false);
        await expect(fetchCampaignInsights(params)).rejects.toThrow(new MetaAdsError("Invalid OAuth access token"));
    });

    it("rejects off-host paging links", async () => {
        mockFetch({ data: [], paging: { next: "https://evil.example/steal" } });
        await expect(fetchCampaignInsights(params)).rejects.toThrow("off-host");
    });
});
