"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

const connectionSchema = z.object({
    success: z.literal(true),
    connection: z
        .object({
            ad_account_id: z.string(),
            usd_to_iqd: z.number(),
            is_active: z.boolean(),
            last_synced_at: z.string().nullable(),
            last_error: z.string().nullable(),
        })
        .nullable(),
});

export type MetaAdsConnection = NonNullable<z.infer<typeof connectionSchema>["connection"]>;

export interface CampaignTotals {
    campaignId: string;
    campaignName: string;
    spendUsd: number;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
}

export interface DailyPoint {
    date: string;
    spendIqd: number;
    results: number;
}

export interface MetaAdsReport {
    spendUsd: number;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
    deliveredOrders: number;
    campaigns: CampaignTotals[];
    daily: DailyPoint[];
}

/** Inclusive Baghdad day range ending today. */
export function dayRange(days: number): { since: string; until: string } {
    const until = baghdadDayKey();
    return { since: addDaysToDayKey(until, -(days - 1)), until };
}

async function fetchReport(since: string, until: string): Promise<MetaAdsReport> {
    const [spend, delivered] = await Promise.all([
        supabase
            .from("ad_spend_daily")
            .select("spend_date, campaign_id, campaign_name, spend_usd, spend_iqd, impressions, clicks, results")
            .gte("spend_date", since)
            .lte("spend_date", until)
            .limit(10000),
        supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["delivered", "completed"])
            .gte("delivered_at", new Date(baghdadDayStart(since)).toISOString())
            .lt("delivered_at", new Date(baghdadDayStart(addDaysToDayKey(until, 1))).toISOString()),
    ]);
    if (spend.error) throw new Error(spend.error.message);
    if (delivered.error) throw new Error(delivered.error.message);

    const byCampaign = new Map<string, CampaignTotals>();
    const byDay = new Map<string, DailyPoint>();
    const report: MetaAdsReport = {
        spendUsd: 0, spendIqd: 0, impressions: 0, clicks: 0, results: 0,
        deliveredOrders: delivered.count ?? 0, campaigns: [], daily: [],
    };

    for (const r of spend.data ?? []) {
        const usd = Number(r.spend_usd);
        report.spendUsd += usd;
        report.spendIqd += Number(r.spend_iqd);
        report.impressions += Number(r.impressions);
        report.clicks += Number(r.clicks);
        report.results += r.results;

        const c = byCampaign.get(r.campaign_id) ?? {
            campaignId: r.campaign_id, campaignName: r.campaign_name,
            spendUsd: 0, spendIqd: 0, impressions: 0, clicks: 0, results: 0,
        };
        c.spendUsd += usd;
        c.spendIqd += Number(r.spend_iqd);
        c.impressions += Number(r.impressions);
        c.clicks += Number(r.clicks);
        c.results += r.results;
        byCampaign.set(r.campaign_id, c);

        const d = byDay.get(r.spend_date) ?? { date: r.spend_date, spendIqd: 0, results: 0 };
        d.spendIqd += Number(r.spend_iqd);
        d.results += r.results;
        byDay.set(r.spend_date, d);
    }
    report.campaigns = [...byCampaign.values()].sort((a, b) => b.spendIqd - a.spendIqd);
    report.daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    return report;
}

export function useMetaAdsReport(days: number) {
    const range = useMemo(() => dayRange(days), [days]);
    return useQuery({
        queryKey: ["meta-ads", "report", range.since, range.until],
        queryFn: () => fetchReport(range.since, range.until),
        staleTime: 60_000,
    });
}

export function useMetaAdsConnection() {
    const { session } = useAuth();
    const token = session?.access_token ?? "";
    return useQuery({
        queryKey: ["meta-ads", "connection"],
        enabled: token !== "",
        queryFn: async () => {
            const res = await fetch("/api/settings/meta-ads", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Meta Ads status failed: ${res.status}`);
            return connectionSchema.parse(await res.json()).connection;
        },
    });
}

/** Page-open auto refresh cadence; the server throttles anyway. */
const AUTO_REFRESH_MS = 5 * 60_000;

export function useMetaAdsSyncNow() {
    const { session } = useAuth();
    const qc = useQueryClient();
    const token = session?.access_token ?? "";
    return useMutation({
        mutationFn: async (opts?: { force?: boolean }) => {
            const res = await fetch(`/api/settings/meta-ads${opts?.force ? "?force=1" : ""}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const body: unknown = await res.json();
            const parsed = z.object({ success: z.boolean(), error: z.string().optional() }).parse(body);
            if (!parsed.success) throw new Error(parsed.error ?? "Sync failed");
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["meta-ads"] }),
    });
}

/** While mounted and connected, ask the server to sync every 5 minutes (throttled server-side). */
export function useMetaAdsAutoRefresh(enabled: boolean) {
    const { mutate } = useMetaAdsSyncNow();
    useEffect(() => {
        if (!enabled) return;
        mutate(undefined);
        const id = setInterval(() => mutate(undefined), AUTO_REFRESH_MS);
        return () => clearInterval(id);
    }, [enabled, mutate]);
}
