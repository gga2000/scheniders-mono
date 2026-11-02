import { z } from "zod";

const GRAPH_VERSION = "v21.0";
const GRAPH_HOST = "https://graph.facebook.com";

/** Meta action types that count as a purchase result (pixel/web or omni). */
const PURCHASE_ACTION_TYPES = new Set(["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);

const numericString = z.string().regex(/^\d+(\.\d+)?$/);

const insightRowSchema = z.object({
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    campaign_id: z.string().min(1),
    campaign_name: z.string(),
    spend: numericString,
    impressions: numericString.optional(),
    clicks: numericString.optional(),
    actions: z.array(z.object({ action_type: z.string(), value: numericString })).optional(),
});

const graphErrorSchema = z.object({
    error: z.object({ message: z.string(), code: z.number().optional() }),
});

export interface CampaignDay {
    spendDate: string;
    campaignId: string;
    campaignName: string;
    spendUsd: number;
    impressions: number;
    clicks: number;
    results: number;
}

export class MetaAdsError extends Error {}

function toCampaignDay(row: z.infer<typeof insightRowSchema>): CampaignDay {
    const results = (row.actions ?? [])
        .filter((a) => PURCHASE_ACTION_TYPES.has(a.action_type))
        // omni_purchase already includes pixel purchases; take the largest, never the sum.
        .reduce((max, a) => Math.max(max, Math.round(Number(a.value))), 0);
    return {
        spendDate: row.date_start,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        spendUsd: Number(row.spend),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        results,
    };
}

/** Pages through an insights edge, validating each page with `rowSchema`. Token goes in a header, never a URL. */
async function fetchInsightRows<T>(
    params: { adAccountId: string; accessToken: string; since: string; until: string },
    level: "campaign" | "ad",
    fields: string,
    rowSchema: z.ZodType<T>,
): Promise<T[]> {
    const query = new URLSearchParams({
        level,
        time_increment: "1",
        fields,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        limit: "500",
    });
    const pageSchema = z.object({
        data: z.array(rowSchema),
        paging: z.object({ next: z.string().url().optional() }).optional(),
    });
    let url: string | null = `${GRAPH_HOST}/${GRAPH_VERSION}/act_${params.adAccountId}/insights?${query}`;
    const out: T[] = [];

    while (url) {
        const res: Response = await fetch(url, {
            headers: { Authorization: `Bearer ${params.accessToken}` },
            cache: "no-store",
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
            const parsed = graphErrorSchema.safeParse(body);
            throw new MetaAdsError(parsed.success ? parsed.data.error.message : `Meta API HTTP ${res.status}`);
        }
        const page = pageSchema.safeParse(body);
        if (!page.success) throw new MetaAdsError("Unexpected response from Meta API");
        out.push(...page.data.data);

        const next = page.data.paging?.next;
        if (next && new URL(next).origin !== GRAPH_HOST) throw new MetaAdsError("Refusing off-host paging URL");
        url = next ?? null;
    }
    return out;
}

/**
 * Daily per-campaign insights for [since, until] (YYYY-MM-DD, inclusive).
 * Read-only: needs an `ads_read` token. Throws MetaAdsError with Meta's message.
 */
export async function fetchCampaignInsights(params: {
    adAccountId: string;
    accessToken: string;
    since: string;
    until: string;
}): Promise<CampaignDay[]> {
    const rows = await fetchInsightRows(params, "campaign", "campaign_id,campaign_name,spend,impressions,clicks,actions", insightRowSchema);
    return rows.map(toCampaignDay);
}

const adRowSchema = insightRowSchema.extend({
    ad_id: z.string().min(1),
    ad_name: z.string(),
    adset_id: z.string().min(1),
    adset_name: z.string(),
    frequency: numericString.optional(),
});

export interface AdDay extends CampaignDay {
    adId: string;
    adName: string;
    adsetId: string;
    adsetName: string;
    /** Meta's average impressions per person that day; not additive. */
    frequency: number;
}

/** Daily per-ad insights (with ad set and campaign ids) for [since, until]. Read-only. */
export async function fetchAdInsights(params: {
    adAccountId: string;
    accessToken: string;
    since: string;
    until: string;
}): Promise<AdDay[]> {
    const rows = await fetchInsightRows(
        params,
        "ad",
        "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,frequency",
        adRowSchema,
    );
    return rows.map((row) => ({
        ...toCampaignDay(row),
        adId: row.ad_id,
        adName: row.ad_name,
        adsetId: row.adset_id,
        adsetName: row.adset_name,
        frequency: Number(row.frequency ?? 0),
    }));
}

const debugTokenSchema = z.object({
    data: z.object({
        is_valid: z.boolean(),
        // Unix seconds; 0 means the token never expires (system user tokens).
        expires_at: z.number().optional(),
        scopes: z.array(z.string()).optional(),
    }),
});

export interface TokenHealth {
    isValid: boolean;
    /** ISO time, or null when the token never expires. */
    expiresAt: string | null;
    hasAdsRead: boolean;
}

/** Meta's own view of the stored token (read-only, `/debug_token`). Throws MetaAdsError when Meta cannot say. */
export async function fetchTokenHealth(accessToken: string): Promise<TokenHealth> {
    const query = new URLSearchParams({ input_token: accessToken });
    const res = await fetch(`${GRAPH_HOST}/${GRAPH_VERSION}/debug_token?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
        const parsed = graphErrorSchema.safeParse(body);
        throw new MetaAdsError(parsed.success ? parsed.data.error.message : `Meta API HTTP ${res.status}`);
    }
    const parsed = debugTokenSchema.safeParse(body);
    if (!parsed.success) throw new MetaAdsError("Unexpected response from Meta API");
    const { is_valid, expires_at, scopes } = parsed.data.data;
    return {
        isValid: is_valid,
        expiresAt: expires_at ? new Date(expires_at * 1000).toISOString() : null,
        hasAdsRead: (scopes ?? []).includes("ads_read"),
    };
}
