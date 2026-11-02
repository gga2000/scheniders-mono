/** One stored day of one ad (a row of ad_insights_daily). */
export interface AdInsightDay {
    spend_date: string;
    ad_id: string;
    ad_name: string;
    adset_id: string;
    adset_name: string;
    campaign_id: string;
    spend_iqd: number;
    impressions: number;
    clicks: number;
    results: number;
    frequency: number;
}

export interface AdTotals {
    adId: string;
    adName: string;
    adsetId: string;
    adsetName: string;
    campaignId: string;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
    /** Clicks per 100 impressions; null with no impressions. */
    ctr: number | null;
    /** Spend per 1,000 impressions in IQD; null with no impressions. */
    cpm: number | null;
    /** Impression-weighted average of the daily frequency; null with no impressions. */
    frequency: number | null;
    fatigued: boolean;
}

export interface AdsetTotals {
    adsetId: string;
    adsetName: string;
    campaignId: string;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
    ctr: number | null;
    cpm: number | null;
    ads: AdTotals[];
}

/** Days compared on each side of the fatigue test. */
export const FATIGUE_RECENT_DAYS = 3;
const FATIGUE_MIN_IMPRESSIONS = 1000;
const FATIGUE_FREQUENCY_RISE = 1.15;
const FATIGUE_CTR_DROP = 0.8;

function ctrOf(clicks: number, impressions: number): number | null {
    return impressions > 0 ? (clicks / impressions) * 100 : null;
}

function cpmOf(spendIqd: number, impressions: number): number | null {
    return impressions > 0 ? Math.round((spendIqd / impressions) * 1000) : null;
}

function weightedFrequency(days: readonly AdInsightDay[]): number | null {
    const impressions = days.reduce((sum, d) => sum + d.impressions, 0);
    if (impressions === 0) return null;
    return days.reduce((sum, d) => sum + d.frequency * d.impressions, 0) / impressions;
}

/**
 * Fatigue: in the last 3 days frequency is up 15%+ and CTR down 20%+ against the
 * days before, with enough impressions on both sides to mean something. Needs
 * at least 6 distinct days of data.
 */
export function isFatigued(days: readonly AdInsightDay[]): boolean {
    const dates = [...new Set(days.map((d) => d.spend_date))].sort();
    if (dates.length < FATIGUE_RECENT_DAYS * 2) return false;
    const recentDates = new Set(dates.slice(-FATIGUE_RECENT_DAYS));
    const recent = days.filter((d) => recentDates.has(d.spend_date));
    const before = days.filter((d) => !recentDates.has(d.spend_date));

    const sum = (rows: readonly AdInsightDay[], key: "impressions" | "clicks") => rows.reduce((t, d) => t + d[key], 0);
    const recentImpressions = sum(recent, "impressions");
    const beforeImpressions = sum(before, "impressions");
    if (recentImpressions < FATIGUE_MIN_IMPRESSIONS || beforeImpressions < FATIGUE_MIN_IMPRESSIONS) return false;

    const recentCtr = ctrOf(sum(recent, "clicks"), recentImpressions);
    const beforeCtr = ctrOf(sum(before, "clicks"), beforeImpressions);
    const recentFrequency = weightedFrequency(recent);
    const beforeFrequency = weightedFrequency(before);
    if (recentCtr === null || beforeCtr === null || recentFrequency === null || beforeFrequency === null || beforeCtr === 0 || beforeFrequency === 0) {
        return false;
    }
    return recentFrequency >= beforeFrequency * FATIGUE_FREQUENCY_RISE && recentCtr <= beforeCtr * FATIGUE_CTR_DROP;
}

/** Roll daily ad rows into ad totals grouped by ad set; biggest spend first at both levels. */
export function groupAdsByAdset(days: readonly AdInsightDay[]): AdsetTotals[] {
    const byAd = new Map<string, AdInsightDay[]>();
    for (const d of days) {
        const rows = byAd.get(d.ad_id);
        if (rows) rows.push(d);
        else byAd.set(d.ad_id, [d]);
    }

    const ads: AdTotals[] = [...byAd.values()].map((rows) => {
        // Names can change over time; show the newest.
        const latest = rows.reduce((a, b) => (b.spend_date > a.spend_date ? b : a));
        const spendIqd = rows.reduce((t, d) => t + d.spend_iqd, 0);
        const impressions = rows.reduce((t, d) => t + d.impressions, 0);
        const clicks = rows.reduce((t, d) => t + d.clicks, 0);
        return {
            adId: latest.ad_id,
            adName: latest.ad_name,
            adsetId: latest.adset_id,
            adsetName: latest.adset_name,
            campaignId: latest.campaign_id,
            spendIqd,
            impressions,
            clicks,
            results: rows.reduce((t, d) => t + d.results, 0),
            ctr: ctrOf(clicks, impressions),
            cpm: cpmOf(spendIqd, impressions),
            frequency: weightedFrequency(rows),
            fatigued: isFatigued(rows),
        };
    });

    const byAdset = new Map<string, AdTotals[]>();
    for (const ad of ads) {
        const list = byAdset.get(ad.adsetId);
        if (list) list.push(ad);
        else byAdset.set(ad.adsetId, [ad]);
    }
    return [...byAdset.values()]
        .map((list) => {
            const sorted = [...list].sort((a, b) => b.spendIqd - a.spendIqd);
            const spendIqd = sorted.reduce((t, a) => t + a.spendIqd, 0);
            const impressions = sorted.reduce((t, a) => t + a.impressions, 0);
            const clicks = sorted.reduce((t, a) => t + a.clicks, 0);
            return {
                adsetId: sorted[0].adsetId,
                adsetName: sorted[0].adsetName,
                campaignId: sorted[0].campaignId,
                spendIqd,
                impressions,
                clicks,
                results: sorted.reduce((t, a) => t + a.results, 0),
                ctr: ctrOf(clicks, impressions),
                cpm: cpmOf(spendIqd, impressions),
                ads: sorted,
            };
        })
        .sort((a, b) => b.spendIqd - a.spendIqd);
}
