import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";

/** Presets on the Ads page date picker. */
export const AD_RANGE_PRESETS = ["today", "yesterday", "7", "30", "90"] as const;
export type AdRangePreset = (typeof AD_RANGE_PRESETS)[number];

export interface DayRange {
    since: string;
    until: string;
}

/** Inclusive Baghdad day range for a preset. */
export function rangeForPreset(preset: AdRangePreset, today: string = baghdadDayKey()): DayRange {
    switch (preset) {
        case "today":
            return { since: today, until: today };
        case "yesterday": {
            const y = addDaysToDayKey(today, -1);
            return { since: y, until: y };
        }
        default:
            return { since: addDaysToDayKey(today, -(Number(preset) - 1)), until: today };
    }
}

/** Number of calendar days in an inclusive range. */
export function rangeLength(range: DayRange): number {
    const ms = Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`);
    return Math.round(ms / 86_400_000) + 1;
}

/** The same-length range immediately before `range`. */
export function previousRange(range: DayRange): DayRange {
    const length = rangeLength(range);
    return { since: addDaysToDayKey(range.since, -length), until: addDaysToDayKey(range.since, -1) };
}

/** Percent change from `previous` to `current`; null when there is no base to compare. */
export function pctChange(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
}

/** One order as the Ads page needs it. */
export interface AdsOrderRow {
    created_at: string;
    status: string;
    ad_channel: string | null;
    attribution: unknown;
}

export interface DailyAdsPoint {
    date: string;
    spendIqd: number;
    orders: number;
    delivered: number;
}

/** Every day of the range, zero-filled, so a quiet day shows as a gap in the chart and not a missing point. */
export function buildDailySeries(
    range: DayRange,
    spendByDay: ReadonlyMap<string, number>,
    ordersByDay: ReadonlyMap<string, number>,
    deliveredByDay: ReadonlyMap<string, number>,
): DailyAdsPoint[] {
    const points: DailyAdsPoint[] = [];
    for (let i = 0, n = rangeLength(range); i < n; i++) {
        const date = addDaysToDayKey(range.since, i);
        points.push({
            date,
            spendIqd: spendByDay.get(date) ?? 0,
            orders: ordersByDay.get(date) ?? 0,
            delivered: deliveredByDay.get(date) ?? 0,
        });
    }
    return points;
}

export interface AttributionCoverage {
    /** Orders that came from an ad network (ad_channel set). */
    adOrders: number;
    /** Of those, the ones that also carry an ad id, so they can be matched to a campaign. */
    withAdId: number;
    pct: number | null;
}

function hasAdId(attribution: unknown): boolean {
    if (typeof attribution !== "object" || attribution === null) return false;
    const adId = (attribution as { adId?: unknown }).adId;
    return typeof adId === "string" && adId.trim() !== "";
}

export function attributionCoverage(orders: readonly AdsOrderRow[]): AttributionCoverage {
    let adOrders = 0;
    let withAdId = 0;
    for (const o of orders) {
        if (!o.ad_channel) continue;
        adOrders++;
        if (hasAdId(o.attribution)) withAdId++;
    }
    return { adOrders, withAdId, pct: adOrders > 0 ? Math.round((withAdId / adOrders) * 100) : null };
}

/**
 * The URL parameters to paste into a Meta ad (Ads Manager > ad > Tracking >
 * URL parameters). The {{...}} macros are filled in by Meta per ad; the
 * storefront proxy reads these exact names (packages/shared ad-attribution).
 */
export const META_URL_PARAMETERS =
    "utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}&utm_term={{adset.id}}&campaign_id={{campaign.id}}";

/** The parts of an order's attribution that name its campaign. */
function campaignRefOf(attribution: unknown): { id: string | null; name: string | null } {
    if (typeof attribution !== "object" || attribution === null) return { id: null, name: null };
    const a = attribution as { campaignId?: unknown; campaign?: unknown };
    const clean = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
    return { id: clean(a.campaignId), name: clean(a.campaign) };
}

export interface MatchResult {
    /** Matched orders per Meta campaign id. */
    byCampaign: Map<string, number>;
    /** Ad orders (ad channel set) that no campaign could be matched to. */
    unmatched: number;
}

/**
 * Credit each ad order to a Meta campaign. The campaign id wins when the
 * order carries one (our own ad links); otherwise the campaign name from the
 * link is compared with Meta's, ignoring case and spacing (LightFunnels
 * orders). An order with neither, or a name Meta does not know, is counted as
 * unmatched instead of being guessed onto a campaign.
 */
export function matchOrdersToCampaigns(
    campaigns: ReadonlyArray<{ campaignId: string; campaignName: string }>,
    orders: ReadonlyArray<{ ad_channel: string | null; attribution: unknown }>,
): MatchResult {
    const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
    const ids = new Set(campaigns.map((c) => c.campaignId));
    const byName = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const c of campaigns) {
        const key = norm(c.campaignName);
        if (byName.has(key) && byName.get(key) !== c.campaignId) ambiguous.add(key);
        byName.set(key, c.campaignId);
    }

    const byCampaign = new Map<string, number>();
    let unmatched = 0;
    for (const o of orders) {
        if (!o.ad_channel) continue;
        const ref = campaignRefOf(o.attribution);
        let target: string | undefined;
        if (ref.id && ids.has(ref.id)) target = ref.id;
        else if (ref.name) {
            const key = norm(ref.name);
            if (!ambiguous.has(key)) target = byName.get(key);
        }
        if (target) byCampaign.set(target, (byCampaign.get(target) ?? 0) + 1);
        else unmatched++;
    }
    return { byCampaign, unmatched };
}

/**
 * The most one delivered order can cost in ads before it loses money: profit before
 * marketing (net profit plus every marketing expense) per delivered order. Store-wide
 * average, because campaigns are not tied to products. Null with nothing delivered
 * or when orders earn nothing before ads.
 */
export function breakEvenCostPerDelivered(netProfit: number, marketingCost: number, deliveredOrders: number): number | null {
    if (deliveredOrders <= 0) return null;
    const perOrder = Math.round((netProfit + marketingCost) / deliveredOrders);
    return perOrder > 0 ? perOrder : null;
}

export type CampaignVerdict = "profitable" | "losing" | "unknown";

/** Green when a campaign's cost per delivered order is at or under break-even, red above it. */
export function campaignVerdict(costPerDelivered: number | null, breakEven: number | null): CampaignVerdict {
    if (costPerDelivered === null || breakEven === null) return "unknown";
    return costPerDelivered <= breakEven ? "profitable" : "losing";
}

/** Whole-number average (numerator per denominator); null when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number): number | null {
    return denominator > 0 ? Math.round(numerator / denominator) : null;
}
