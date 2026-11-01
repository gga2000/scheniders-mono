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
