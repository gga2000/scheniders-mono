import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { syncMetaAdsForTenant } from "@/lib/meta-ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: pull the last week of Meta ad spend for every tenant with an active connection. */
export async function GET(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

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
