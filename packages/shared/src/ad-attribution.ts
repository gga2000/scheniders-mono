import { z } from "zod";

// =============================================
// AD ATTRIBUTION
//
// LightFunnels records where an order came from as a list of UTM pairs on the
// order (`utm { k v }` in their GraphQL API). Verified live on 2026-09-12:
//
//   #7401 -> source=fb, medium=Facebook_Mobile_Reels, campaign=بيرسيفيرون,
//            content="Multi ads", id=120248083800400132, term=120248083800390132
//   #7402 -> source=ig, medium=Instagram_Reels, (same campaign)
//
// Our own `orders.source` only ever says "lightfunnels", which answers "which
// system sent this" and not "which ad did the customer click". This module turns
// the raw pairs into a normalized channel the UI can badge and reports can group.
// =============================================

/** Networks we can name. Anything unrecognised stays `other` with its raw source kept. */
export type AdChannel =
    | "facebook"
    | "instagram"
    | "tiktok"
    | "threads"
    | "audience_network"
    | "snapchat"
    | "google"
    | "youtube"
    | "other";

/** One `utm` entry as LightFunnels returns it. */
export interface UtmPair {
    k?: string | null;
    v?: string | null;
}

/** A type alias, not an interface, so it is assignable to the Supabase Json type. */
export type AdAttribution = {
    channel: AdChannel;
    /** Raw `source` value as the ad platform wrote it ("fb", "ig", …). */
    source?: string;
    /** Placement, e.g. "Instagram_Reels". */
    medium?: string;
    campaign?: string;
    /** Creative label, e.g. "Multi ads". */
    content?: string;
    /** Platform ad id. */
    adId?: string;
    /** Platform adset/term id. */
    term?: string;
    /** Platform campaign id (own storefront links only). */
    campaignId?: string;
    /** Facebook click id (own storefront links only). */
    fbclid?: string;
};

/**
 * Meta writes `fb`/`ig`, TikTok writes `tiktok` or `tt`, and hand-built links
 * write the full word. Matched on a normalized token, so "FB" and "Facebook"
 * both land on facebook.
 */
const SOURCE_TO_CHANNEL: Record<string, AdChannel> = {
    fb: "facebook",
    facebook: "facebook",
    "facebook.com": "facebook",
    meta: "facebook",
    ig: "instagram",
    instagram: "instagram",
    "instagram.com": "instagram",
    tt: "tiktok",
    tiktok: "tiktok",
    "tiktok.com": "tiktok",
    // Seen live in this account's data: Meta bills Threads and Audience Network
    // as their own placements, and merchants buy them separately.
    th: "threads",
    threads: "threads",
    an: "audience_network",
    audience_network: "audience_network",
    sc: "snapchat",
    snap: "snapchat",
    snapchat: "snapchat",
    google: "google",
    "google.com": "google",
    adwords: "google",
    gads: "google",
    yt: "youtube",
    youtube: "youtube",
};

/**
 * Placement names carry the network when `source` is missing or unfamiliar
 * ("Instagram_Reels", "Facebook_Mobile_Feed"). Ordered longest-first so
 * "instagram" is tested before a bare "gram" style substring could ever collide.
 */
const MEDIUM_HINTS: ReadonlyArray<[string, AdChannel]> = [
    ["audience_network", "audience_network"],
    ["instagram", "instagram"],
    ["threads", "threads"],
    ["facebook", "facebook"],
    ["snapchat", "snapchat"],
    ["youtube", "youtube"],
    ["tiktok", "tiktok"],
    ["google", "google"],
];

function normalizeToken(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Meta ad templates use `{{macros}}`; when one is misconfigured the literal
 * `{{site_source_name}}` arrives as the source. Seen live in this account.
 * Treating it as a channel name would print gibberish on the order card — it is
 * an absence of attribution, not a network.
 */
function isUnrenderedMacro(value: string): boolean {
    return /\{\{.*\}\}/.test(value) || /^%7B%7B/i.test(value);
}

/** Map a raw source (and its placement, as a fallback) onto a known network. */
export function resolveChannel(source?: string, medium?: string): AdChannel {
    const token = normalizeToken(source ?? "");
    if (token && SOURCE_TO_CHANNEL[token]) return SOURCE_TO_CHANNEL[token];

    const mediumToken = normalizeToken(medium ?? "");
    if (mediumToken) {
        for (const [hint, channel] of MEDIUM_HINTS) {
            if (mediumToken.includes(hint)) return channel;
        }
    }

    // An unknown network is still a real one — the UI shows the raw source rather
    // than guessing, so a new platform degrades to "labelled correctly but generic".
    return "other";
}

/**
 * Turn LightFunnels' UTM pairs into a normalized attribution.
 *
 * Returns undefined when there is nothing usable, so callers can leave the
 * columns null instead of storing an empty shell that reads as "we looked and
 * the answer was nothing".
 */
export function parseAdAttribution(utm: UtmPair[] | null | undefined): AdAttribution | undefined {
    if (!Array.isArray(utm) || utm.length === 0) return undefined;

    const byKey = new Map<string, string>();
    for (const pair of utm) {
        const key = normalizeToken(pair?.k ?? "");
        const value = (pair?.v ?? "").trim();
        // Last write wins, but never let a blank — or an unrendered ad macro —
        // overwrite a real value.
        if (key && value && !isUnrenderedMacro(value)) byKey.set(key, value);
    }

    if (byKey.size === 0) return undefined;

    const source = byKey.get("source");
    const medium = byKey.get("medium");

    return {
        channel: resolveChannel(source, medium),
        source,
        medium,
        campaign: byKey.get("campaign"),
        content: byKey.get("content"),
        adId: byKey.get("id"),
        term: byKey.get("term"),
    };
}

/** Longest value kept per field; ad names can be long but never unbounded. */
const MAX_PARAM_LENGTH = 120;

/**
 * Build an attribution from a storefront landing URL. Meta ad links carry
 * utm_source / utm_medium / utm_campaign / utm_content, plus utm_id (ad id),
 * utm_term (ad set id), campaign_id and fbclid. Returns undefined when the
 * URL has no ad parameters at all, so organic visits stay unattributed.
 */
export function parseAdUrlParams(params: { get(name: string): string | null }): AdAttribution | undefined {
    const read = (name: string): string | undefined => {
        const raw = (params.get(name) ?? "").trim().slice(0, MAX_PARAM_LENGTH);
        return raw && !isUnrenderedMacro(raw) ? raw : undefined;
    };
    const source = read("utm_source");
    const medium = read("utm_medium");
    const fbclid = read("fbclid");
    if (!source && !fbclid) return undefined;
    return {
        // A bare fbclid means the click came from Meta even without utm tags.
        channel: source || medium ? resolveChannel(source, medium) : "facebook",
        source,
        medium,
        campaign: read("utm_campaign"),
        content: read("utm_content"),
        adId: read("utm_id"),
        term: read("utm_term"),
        campaignId: read("campaign_id"),
        fbclid,
    };
}

const CHANNELS = [
    "facebook", "instagram", "tiktok", "threads", "audience_network",
    "snapchat", "google", "youtube", "other",
] as const satisfies readonly AdChannel[];

const adAttributionSchema = z.object({
    channel: z.enum(CHANNELS),
    source: z.string().max(MAX_PARAM_LENGTH).optional(),
    medium: z.string().max(MAX_PARAM_LENGTH).optional(),
    campaign: z.string().max(MAX_PARAM_LENGTH).optional(),
    content: z.string().max(MAX_PARAM_LENGTH).optional(),
    adId: z.string().max(MAX_PARAM_LENGTH).optional(),
    term: z.string().max(MAX_PARAM_LENGTH).optional(),
    campaignId: z.string().max(MAX_PARAM_LENGTH).optional(),
    fbclid: z.string().max(MAX_PARAM_LENGTH).optional(),
});

/** Cookie holding a buyer's last ad click (written by the storefront proxy). */
export const AD_ATTRIBUTION_COOKIE = "sb_ad";

/** Cookie value for a visitor's last ad click (JSON, URL-encoded). */
export function serializeAdAttribution(attribution: AdAttribution): string {
    return encodeURIComponent(JSON.stringify(attribution));
}

/**
 * Read the cookie back. The cookie is visitor-controlled, so anything that is
 * not exactly an attribution object is dropped, never trusted.
 */
export function deserializeAdAttribution(raw: string | undefined | null): AdAttribution | undefined {
    if (!raw) return undefined;
    try {
        const parsed = adAttributionSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
        return parsed.success ? parsed.data : undefined;
    } catch {
        // Malformed cookie text: treat as no attribution.
        return undefined;
    }
}

/** Display label for a channel; unknown networks fall back to their raw source. */
export function channelLabel(attribution: AdAttribution | null | undefined): string | undefined {
    if (!attribution) return undefined;
    switch (attribution.channel) {
        case "facebook": return "Facebook";
        case "instagram": return "Instagram";
        case "tiktok": return "TikTok";
        case "threads": return "Threads";
        case "audience_network": return "Audience Network";
        case "snapchat": return "Snapchat";
        case "google": return "Google";
        case "youtube": return "YouTube";
        default: return attribution.source || undefined;
    }
}

/**
 * Placement without the network prefix: "Instagram_Reels" -> "Reels".
 * The badge already says Instagram; repeating it wastes the row's width.
 */
export function placementLabel(attribution: AdAttribution | null | undefined): string | undefined {
    const medium = attribution?.medium?.trim();
    if (!medium) return undefined;

    const stripped = medium
        .replace(/^(instagram|facebook|tiktok|threads|snapchat|youtube|google)[_\s-]*/i, "")
        .replace(/[_]+/g, " ")
        .trim();

    return stripped || undefined;
}
