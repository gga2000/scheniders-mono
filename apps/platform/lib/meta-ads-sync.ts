import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchCampaignInsights, MetaAdsError } from "@/lib/meta-ads";

/** Meta revises recent days (late conversions, refunds), so re-pull a rolling window. */
const SYNC_WINDOW_DAYS = 7;

export interface MetaAdsConnection {
    tenant_id: string;
    ad_account_id: string;
    access_token: string;
    usd_to_iqd: number;
}

export interface SyncOutcome {
    ok: boolean;
    rows: number;
    error?: string;
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Pull the rolling window for one tenant and upsert it. Service-role client only. */
export async function syncMetaAdsForTenant(
    db: ReturnType<typeof createSupabaseServiceClient>,
    conn: MetaAdsConnection,
    now: Date = new Date(),
): Promise<SyncOutcome> {
    const until = isoDay(now);
    const since = isoDay(new Date(now.getTime() - SYNC_WINDOW_DAYS * 86_400_000));

    try {
        const days = await fetchCampaignInsights({
            adAccountId: conn.ad_account_id,
            accessToken: conn.access_token,
            since,
            until,
        });

        if (days.length > 0) {
            const { error } = await db.from("ad_spend_daily").upsert(
                days.map((d) => ({
                    tenant_id: conn.tenant_id,
                    spend_date: d.spendDate,
                    campaign_id: d.campaignId,
                    campaign_name: d.campaignName,
                    spend_usd: d.spendUsd,
                    usd_to_iqd: conn.usd_to_iqd,
                    spend_iqd: Math.round(d.spendUsd * conn.usd_to_iqd),
                    impressions: d.impressions,
                    clicks: d.clicks,
                    results: d.results,
                    synced_at: new Date().toISOString(),
                })),
                { onConflict: "tenant_id,spend_date,campaign_id" },
            );
            if (error) throw new Error(error.message);
        }

        await db
            .from("meta_ads_connections")
            .update({ last_synced_at: new Date().toISOString(), last_error: null })
            .eq("tenant_id", conn.tenant_id);
        return { ok: true, rows: days.length };
    } catch (e) {
        const message = e instanceof MetaAdsError || e instanceof Error ? e.message : "Sync failed";
        await db
            .from("meta_ads_connections")
            .update({ last_error: message.slice(0, 500) })
            .eq("tenant_id", conn.tenant_id);
        return { ok: false, rows: 0, error: message };
    }
}
