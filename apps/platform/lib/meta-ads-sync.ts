import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchAdInsights, fetchCampaignInsights, MetaAdsError } from "@/lib/meta-ads";
import { META_EXPENSE_CATEGORY, META_EXPENSE_SOURCE, planMetaExpenses } from "@/lib/meta-ads-expenses";

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

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Keeps one auto "marketing" expense per day in step with synced ad spend (F1).
 * Manual marketing expenses are never touched; a day that has one is not auto-posted,
 * and an auto row for that day is removed so the spend is counted once.
 */
async function postAdSpendExpenses(db: ServiceDb, tenantId: string, since: string, until: string): Promise<void> {
    const [spend, manual, auto] = await Promise.all([
        db.from("ad_spend_daily").select("spend_date, spend_iqd").eq("tenant_id", tenantId).gte("spend_date", since).lte("spend_date", until),
        db.from("expenses").select("expense_date").eq("tenant_id", tenantId).eq("category", META_EXPENSE_CATEGORY).is("source", null).gte("expense_date", since).lte("expense_date", until),
        db.from("expenses").select("id, external_key, amount").eq("tenant_id", tenantId).eq("source", META_EXPENSE_SOURCE).gte("expense_date", since).lte("expense_date", until),
    ]);
    if (spend.error) throw new Error(spend.error.message);
    if (manual.error) throw new Error(manual.error.message);
    if (auto.error) throw new Error(auto.error.message);

    const planned = planMetaExpenses(
        tenantId,
        spend.data.map((r) => ({ spendDate: r.spend_date, spendIqd: Number(r.spend_iqd) })),
        new Set(manual.data.map((r) => r.expense_date)),
    );
    const existing = new Map(auto.data.map((r) => [r.external_key, r]));
    const plannedKeys = new Set(planned.map((r) => r.external_key));

    const stale = auto.data.filter((r) => r.external_key !== null && !plannedKeys.has(r.external_key)).map((r) => r.id);
    if (stale.length > 0) {
        const { error } = await db.from("expenses").delete().eq("tenant_id", tenantId).in("id", stale);
        if (error) throw new Error(error.message);
    }

    const toInsert = planned.filter((r) => !existing.has(r.external_key));
    if (toInsert.length > 0) {
        const { error } = await db.from("expenses").insert(toInsert);
        if (error) throw new Error(error.message);
    }
    for (const row of planned) {
        const found = existing.get(row.external_key);
        if (found && Number(found.amount) !== row.amount) {
            const { error } = await db.from("expenses").update({ amount: row.amount }).eq("tenant_id", tenantId).eq("id", found.id);
            if (error) throw new Error(error.message);
        }
    }
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

        const adDays = await fetchAdInsights({
            adAccountId: conn.ad_account_id,
            accessToken: conn.access_token,
            since,
            until,
        });
        if (adDays.length > 0) {
            const { error } = await db.from("ad_insights_daily").upsert(
                adDays.map((d) => ({
                    tenant_id: conn.tenant_id,
                    spend_date: d.spendDate,
                    ad_id: d.adId,
                    ad_name: d.adName,
                    adset_id: d.adsetId,
                    adset_name: d.adsetName,
                    campaign_id: d.campaignId,
                    spend_usd: d.spendUsd,
                    spend_iqd: Math.round(d.spendUsd * conn.usd_to_iqd),
                    impressions: d.impressions,
                    clicks: d.clicks,
                    results: d.results,
                    frequency: d.frequency,
                    synced_at: new Date().toISOString(),
                })),
                { onConflict: "tenant_id,spend_date,ad_id" },
            );
            if (error) throw new Error(error.message);
        }

        await postAdSpendExpenses(db, conn.tenant_id, since, until);

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
