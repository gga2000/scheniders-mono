import { describe, it, expect } from "vitest";
import {
    parseAdAttribution,
    resolveChannel,
    channelLabel,
    placementLabel,
    parseAdUrlParams,
    serializeAdAttribution,
    deserializeAdAttribution,
} from "./ad-attribution";

// Copied verbatim from LightFunnels' API on 2026-09-12 for orders #7401 / #7402.
const ORDER_7401 = [
    { k: "source", v: "fb" },
    { k: "medium", v: "Facebook_Mobile_Reels" },
    { k: "campaign", v: "بيرسيفيرون" },
    { k: "content", v: "Multi ads" },
    { k: "id", v: "120248083800400132" },
    { k: "term", v: "120248083800390132" },
];

const ORDER_7402 = [
    { k: "source", v: "ig" },
    { k: "medium", v: "Instagram_Reels" },
    { k: "campaign", v: "بيرسيفيرون" },
];

describe("parseAdAttribution — real LightFunnels payloads", () => {
    it("reads a Facebook Reels order end to end", () => {
        expect(parseAdAttribution(ORDER_7401)).toEqual({
            channel: "facebook",
            source: "fb",
            medium: "Facebook_Mobile_Reels",
            campaign: "بيرسيفيرون",
            content: "Multi ads",
            adId: "120248083800400132",
            term: "120248083800390132",
        });
    });

    it("separates Instagram from Facebook — the whole point of the feature", () => {
        expect(parseAdAttribution(ORDER_7402)?.channel).toBe("instagram");
        expect(parseAdAttribution(ORDER_7401)?.channel).toBe("facebook");
    });

    it("leaves absent keys undefined rather than empty strings", () => {
        const parsed = parseAdAttribution(ORDER_7402);
        expect(parsed?.adId).toBeUndefined();
        expect(parsed?.content).toBeUndefined();
    });
});

describe("parseAdAttribution — empty and malformed input", () => {
    it("returns nothing when there is nothing to record", () => {
        expect(parseAdAttribution(undefined)).toBeUndefined();
        expect(parseAdAttribution(null)).toBeUndefined();
        expect(parseAdAttribution([])).toBeUndefined();
    });

    it("returns nothing when every pair is blank", () => {
        expect(parseAdAttribution([{ k: "source", v: "" }, { k: "", v: "fb" }])).toBeUndefined();
    });

    it("never lets a blank overwrite a real value", () => {
        const parsed = parseAdAttribution([
            { k: "source", v: "ig" },
            { k: "source", v: "   " },
        ]);
        expect(parsed?.source).toBe("ig");
    });

    it("survives null keys and values", () => {
        const parsed = parseAdAttribution([{ k: null, v: null }, { k: "source", v: "fb" }]);
        expect(parsed?.channel).toBe("facebook");
    });
});

describe("resolveChannel", () => {
    it("maps the platform codes", () => {
        expect(resolveChannel("fb")).toBe("facebook");
        expect(resolveChannel("ig")).toBe("instagram");
        expect(resolveChannel("tiktok")).toBe("tiktok");
        expect(resolveChannel("tt")).toBe("tiktok");
        expect(resolveChannel("google")).toBe("google");
    });

    it("ignores case and surrounding whitespace", () => {
        expect(resolveChannel(" FB ")).toBe("facebook");
        expect(resolveChannel("Instagram")).toBe("instagram");
    });

    it("falls back to the placement when the source is unfamiliar", () => {
        // Hand-built links often carry a junk source but an honest medium.
        expect(resolveChannel("paid_social", "Instagram_Reels")).toBe("instagram");
        expect(resolveChannel(undefined, "TikTok_Feed")).toBe("tiktok");
    });

    it("reports other for a network it has never seen", () => {
        expect(resolveChannel("pinterest")).toBe("other");
        expect(resolveChannel()).toBe("other");
    });
});

describe("labels", () => {
    it("names the known networks", () => {
        expect(channelLabel(parseAdAttribution(ORDER_7401))).toBe("Facebook");
        expect(channelLabel(parseAdAttribution(ORDER_7402))).toBe("Instagram");
    });

    it("shows the raw source for an unknown network rather than guessing", () => {
        const parsed = parseAdAttribution([{ k: "source", v: "pinterest" }]);
        expect(parsed?.channel).toBe("other");
        expect(channelLabel(parsed)).toBe("pinterest");
    });

    it("strips the network prefix off the placement", () => {
        expect(placementLabel(parseAdAttribution(ORDER_7401))).toBe("Mobile Reels");
        expect(placementLabel(parseAdAttribution(ORDER_7402))).toBe("Reels");
    });

    it("keeps a placement that is not prefixed", () => {
        expect(placementLabel({ channel: "other", medium: "Stories" })).toBe("Stories");
    });

    it("returns nothing when there is no placement", () => {
        expect(placementLabel(undefined)).toBeUndefined();
        expect(placementLabel({ channel: "facebook" })).toBeUndefined();
    });
});

describe("channels found in live data (2026-09-12 backfill of 150 orders)", () => {
    it("maps TikTok, which writes the full word with a generic medium", () => {
        const parsed = parseAdAttribution([{ k: "source", v: "tiktok" }, { k: "medium", v: "paid" }]);
        expect(parsed?.channel).toBe("tiktok");
        expect(channelLabel(parsed)).toBe("TikTok");
    });

    it("separates Threads from Facebook — Meta bills it as its own placement", () => {
        const parsed = parseAdAttribution([{ k: "source", v: "th" }, { k: "medium", v: "Threads_Feed" }]);
        expect(parsed?.channel).toBe("threads");
        expect(placementLabel(parsed)).toBe("Feed");
    });

    it("recognises Audience Network", () => {
        const parsed = parseAdAttribution([{ k: "source", v: "an" }, { k: "medium", v: "an" }]);
        expect(parsed?.channel).toBe("audience_network");
        expect(channelLabel(parsed)).toBe("Audience Network");
    });

    it("keeps every Instagram placement on one channel", () => {
        for (const medium of ["Instagram_Reels", "Instagram_Stories", "Instagram_Feed", "paid", "social"]) {
            const parsed = parseAdAttribution([{ k: "source", v: "ig" }, { k: "medium", v: medium }]);
            expect(parsed?.channel).toBe("instagram");
        }
    });
});

describe("unrendered Meta macros", () => {
    // One live ad has a broken tracking template and sends the macro literally.
    it("refuses to treat {{site_source_name}} as a channel", () => {
        const parsed = parseAdAttribution([
            { k: "source", v: "{{site_source_name}}" },
            { k: "medium", v: "{{adset.name}}" },
        ]);
        expect(parsed).toBeUndefined();
    });

    it("ignores a macro but keeps the usable pairs beside it", () => {
        const parsed = parseAdAttribution([
            { k: "source", v: "{{site_source_name}}" },
            { k: "campaign", v: "بيرسيفيرون" },
        ]);
        expect(parsed?.source).toBeUndefined();
        expect(parsed?.campaign).toBe("بيرسيفيرون");
        expect(parsed?.channel).toBe("other");
        // Nothing to name, so the badge renders nothing rather than gibberish.
        expect(channelLabel(parsed)).toBeUndefined();
    });

    it("catches the url-encoded form too", () => {
        expect(parseAdAttribution([{ k: "source", v: "%7B%7Bsite_source_name%7D%7D" }])).toBeUndefined();
    });
});

describe("parseAdUrlParams", () => {
    const url = (qs: string) => new URL(`https://shop.example/?${qs}`).searchParams;

    it("reads a Meta ad link", () => {
        const a = parseAdUrlParams(
            url("utm_source=fb&utm_medium=Instagram_Reels&utm_campaign=Eid&utm_content=Video1&utm_id=123&utm_term=456&campaign_id=789&fbclid=abc"),
        );
        expect(a).toMatchObject({
            channel: "facebook",
            medium: "Instagram_Reels",
            campaign: "Eid",
            content: "Video1",
            adId: "123",
            term: "456",
            campaignId: "789",
            fbclid: "abc",
        });
    });

    it("treats a bare fbclid as a Facebook click", () => {
        expect(parseAdUrlParams(url("fbclid=xyz"))).toMatchObject({ channel: "facebook", fbclid: "xyz" });
    });

    it("returns undefined for organic visits and unrendered macros", () => {
        expect(parseAdUrlParams(url("ref=home"))).toBeUndefined();
        expect(parseAdUrlParams(url("utm_source=%7B%7Bsite_source_name%7D%7D"))).toBeUndefined();
    });
});

describe("ad attribution cookie", () => {
    it("round-trips Arabic campaign names", () => {
        const a = { channel: "instagram" as const, campaign: "عيد الفطر", adId: "1" };
        expect(deserializeAdAttribution(serializeAdAttribution(a))).toEqual(a);
    });

    it("drops forged or malformed cookies", () => {
        expect(deserializeAdAttribution(encodeURIComponent(JSON.stringify({ channel: "evil" })))).toBeUndefined();
        expect(deserializeAdAttribution("%%%not-json")).toBeUndefined();
        expect(deserializeAdAttribution(undefined)).toBeUndefined();
    });
});
