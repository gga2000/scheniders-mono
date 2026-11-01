"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import {
    attributionCoverage,
    matchOrdersToCampaigns,
    buildDailySeries,
    previousRange,
    rangeForPreset,
    type AdRangePreset,
    type AdsOrderRow,
    type AttributionCoverage,
    type DailyAdsPoint,
    type DayRange,
} from "@/lib/ads-report";

const tokenHealthSchema = z
    .object({ isValid: z.boolean(), expiresAt: z.string().nullable(), hasAdsRead: z.boolean() })
    .nullable();

const connectionSchema = z.object({
    success: z.literal(true),
    tokenHealth: tokenHealthSchema,
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

export type MetaAdsConnection = NonNullable<z.infer<typeof connectionSchema>["connection"]> & {
    /** Meta's verdict on the stored token; null when Meta could not be asked. */
    tokenHealth: z.infer<typeof tokenHealthSchema>;
};

export interface CampaignTotals {
    campaignId: string;
    campaignName: string;
    spendUsd: number;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
    /** Orders matched to this campaign (see matchOrdersToCampaigns). */
    orders: number;
    delivered: number;
}

export interface MetaAdsReport {
    spendUsd: number;
    spendIqd: number;
    impressions: number;
    clicks: number;
    results: number;
    /** New customer orders placed in the range (no returns, replacements or tests). */
    orders: number;
    deliveredOrders: number;
    campaigns: CampaignTotals[];
    daily: DailyAdsPoint[];
    coverage: AttributionCoverage;
    /** Ad orders that could not be matched to any campaign. */
    unmatched: { orders: number; delivered: number };
}

/** Supabase returns at most 1000 rows per request; walk the pages. */
const PAGE = 1000;

/** Real customer orders only: a return, a replacement or a test order was never bought through an ad. */
function realOrders<T extends { or: (filters: string) => T }>(query: T): T {
    return query.or("is_return.is.null,is_return.eq.false").or("is_replacement.is.null,is_replacement.eq.false").or("is_test.is.null,is_test.eq.false");
}

async function fetchOrdersPlaced(range: DayRange): Promise<AdsOrderRow[]> {
    const rows: AdsOrderRow[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await realOrders(
            supabase
                .from("orders")
                .select("created_at, status, ad_channel, attribution")
                .gte("created_at", new Date(baghdadDayStart(range.since)).toISOString())
                .lt("created_at", new Date(baghdadDayStart(addDaysToDayKey(range.until, 1))).toISOString()),
        ).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE) return rows;
    }
}

interface DeliveredRow {
    delivered_at: string;
    ad_channel: string | null;
    attribution: unknown;
}

async function fetchDelivered(range: DayRange): Promise<DeliveredRow[]> {
    const rows: DeliveredRow[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await realOrders(
            supabase
                .from("orders")
                .select("delivered_at, ad_channel, attribution")
                .in("status", ["delivered", "completed"])
                .gte("delivered_at", new Date(baghdadDayStart(range.since)).toISOString())
                .lt("delivered_at", new Date(baghdadDayStart(addDaysToDayKey(range.until, 1))).toISOString()),
        ).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) if (r.delivered_at) rows.push({ ...r, delivered_at: r.delivered_at });
        if ((data?.length ?? 0) < PAGE) return rows;
    }
}

function countByDay(stamps: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const s of stamps) {
        const day = baghdadDayKey(new Date(s));
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
}

async function fetchReport(range: DayRange): Promise<MetaAdsReport> {
    const [spend, placed, delivered] = await Promise.all([
        supabase
            .from("ad_spend_daily")
            .select("spend_date, campaign_id, campaign_name, spend_usd, spend_iqd, impressions, clicks, results")
            .gte("spend_date", range.since)
            .lte("spend_date", range.until)
            .limit(10000),
        fetchOrdersPlaced(range),
        fetchDelivered(range),
    ]);
    if (spend.error) throw new Error(spend.error.message);

    const byCampaign = new Map<string, CampaignTotals>();
    const spendByDay = new Map<string, number>();
    const report: MetaAdsReport = {
        spendUsd: 0, spendIqd: 0, impressions: 0, clicks: 0, results: 0,
        orders: placed.length, deliveredOrders: delivered.length,
        campaigns: [], daily: [], coverage: attributionCoverage(placed), unmatched: { orders: 0, delivered: 0 },
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
            spendUsd: 0, spendIqd: 0, impressions: 0, clicks: 0, results: 0, orders: 0, delivered: 0,
        };
        c.spendUsd += usd;
        c.spendIqd += Number(r.spend_iqd);
        c.impressions += Number(r.impressions);
        c.clicks += Number(r.clicks);
        c.results += r.results;
        byCampaign.set(r.campaign_id, c);

        spendByDay.set(r.spend_date, (spendByDay.get(r.spend_date) ?? 0) + Number(r.spend_iqd));
    }
    report.campaigns = [...byCampaign.values()].sort((a, b) => b.spendIqd - a.spendIqd);
    const placedMatch = matchOrdersToCampaigns(report.campaigns, placed);
    const deliveredMatch = matchOrdersToCampaigns(report.campaigns, delivered);
    for (const c of report.campaigns) {
        c.orders = placedMatch.byCampaign.get(c.campaignId) ?? 0;
        c.delivered = deliveredMatch.byCampaign.get(c.campaignId) ?? 0;
    }
    report.unmatched = { orders: placedMatch.unmatched, delivered: deliveredMatch.unmatched };
    report.daily = buildDailySeries(
        range,
        spendByDay,
        countByDay(placed.map((o) => o.created_at)),
        countByDay(delivered.map((o) => o.delivered_at)),
    );
    return report;
}

function useReportFor(range: DayRange, enabled: boolean) {
    return useQuery({
        queryKey: ["meta-ads", "report", range.since, range.until],
        queryFn: () => fetchReport(range),
        staleTime: 60_000,
        enabled,
    });
}

/** The selected range, plus the same-length window before it when `compare` is on. */
export function useMetaAdsReport(preset: AdRangePreset, compare: boolean) {
    const range = useMemo(() => rangeForPreset(preset), [preset]);
    const previous = useMemo(() => previousRange(range), [range]);
    return { current: useReportFor(range, true), previous: useReportFor(previous, compare), range };
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
            const parsed = connectionSchema.parse(await res.json());
            return parsed.connection ? { ...parsed.connection, tokenHealth: parsed.tokenHealth } : null;
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
