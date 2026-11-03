import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { fetchAccountLimit } from "@/lib/meta-ads";

export const dynamic = "force-dynamic";

/**
 * How much room is left under the Meta ad account's spending limit, in IQD at the store's saved rate.
 * Admins only (it is money data, like ad spend). `limit` is null when Meta sets no cap, uses another
 * currency than USD, or cannot be asked; the token never leaves the server.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const { data, error } = await createSupabaseServiceClient()
        .from("meta_ads_connections")
        .select("ad_account_id, access_token, usd_to_iqd")
        .eq("tenant_id", caller.tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: true, limit: null });

    try {
        const account = await fetchAccountLimit({ adAccountId: data.ad_account_id, accessToken: data.access_token });
        if (account.currency !== "USD" || account.spendCap === null) return NextResponse.json({ success: true, limit: null });
        const leftUsd = Math.max(0, account.spendCap - account.amountSpent);
        return NextResponse.json({
            success: true,
            limit: {
                leftIqd: Math.round(leftUsd * data.usd_to_iqd),
                capIqd: Math.round(account.spendCap * data.usd_to_iqd),
                owedIqd: Math.round(account.balance * data.usd_to_iqd),
            },
        });
    } catch (e) {
        return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Meta request failed" }, { status: 502 });
    }
}
