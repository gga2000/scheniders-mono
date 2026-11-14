import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { fetchAccountBilling, META_BILLING_THRESHOLD_USD } from "@/lib/meta-ads";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

/**
 * Where the Meta ad account stands on billing: what Meta is owed but has not charged yet, and how much more can be
 * spent before the next charge (the billing threshold), in USD with the IQD equivalent at the store's saved rate.
 * Admins only (money data, like ad spend); the token never leaves the server. `billing` is null with no active
 * link or a non-USD account.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const { data, error } = await createSupabaseServiceClient()
        .from("meta_ads_connections")
        .select("ad_account_id, access_token, usd_to_iqd")
        .eq("tenant_id", caller.tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: true, billing: null });

    try {
        const account = await fetchAccountBilling({ adAccountId: data.ad_account_id, accessToken: data.access_token });
        if (account.currency !== "USD") return NextResponse.json({ success: true, billing: null });
        const iqd = (usd: number) => Math.round(usd * data.usd_to_iqd);
        const leftUsd = Math.max(0, META_BILLING_THRESHOLD_USD - account.balance);
        return NextResponse.json({
            success: true,
            billing: { owedUsd: account.balance, owedIqd: iqd(account.balance), leftUsd, leftIqd: iqd(leftUsd) },
        });
    } catch (e) {
        return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Meta request failed" }, { status: 502 });
    }
}

export const GET = withFailureReport("api/settings/meta-ads/billing GET", handleGET);
