import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { syncMetaAdsForTenant } from "@/lib/meta-ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pull the last week of Meta ad spend for every tenant with an active connection. */
async function syncAllTenants(): Promise<NextResponse> {
    const db = createSupabaseServiceClient();
    const { data: connections, error } = await db
        .from("meta_ads_connections")
        .select("tenant_id, ad_account_id, access_token, usd_to_iqd")
        .eq("is_active", true);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    let synced = 0;
    let failed = 0;
    for (const conn of connections ?? []) {
        const outcome = await syncMetaAdsForTenant(db, conn);
        if (outcome.ok) synced += 1;
        else failed += 1;
    }
    return NextResponse.json({ success: true, synced, failed });
}

/** Daily Vercel cron (Bearer CRON_SECRET). */
export async function GET(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    return syncAllTenants();
}

/** QStash schedule (every 5 min): the Upstash signature proves the caller. */
export async function POST(request: Request) {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) {
        return NextResponse.json({ error: "QStash signing keys not configured" }, { status: 401 });
    }
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const body = await request.text();
    const signature = request.headers.get("upstash-signature") ?? "";
    try {
        await receiver.verify({ signature, body });
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    return syncAllTenants();
}
