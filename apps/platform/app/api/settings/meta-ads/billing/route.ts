import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { fetchAccountBilling } from "@/lib/meta-ads";

export const dynamic = "force-dynamic";

/**
 * Where the Meta ad account stands on billing, in IQD at the store's saved rate: what Meta is owed but has not
 * charged yet, and how much more can be spent before the next charge (the billing threshold). Admins only (money
 * data, like ad spend); the token never leaves the server. `billing` is null with no active link or a non-USD account.
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
    if (!data) return NextResponse.json({ success: true, billing: null });

    try {
        const account = await fetchAccountBilling({ adAccountId: data.ad_account_id, accessToken: data.access_token });
        if (account.currency !== "USD") return NextResponse.json({ success: true, billing: null });
        const iqd = (usd: number) => Math.round(usd * data.usd_to_iqd);
        return NextResponse.json({
            success: true,
            billing: {
                owedIqd: iqd(account.balance),
                thresholdIqd: account.threshold === null ? null : iqd(account.threshold),
                leftIqd: account.threshold === null ? null : iqd(Math.max(0, account.threshold - account.balance)),
            },
        });
    } catch (e) {
        return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Meta request failed" }, { status: 502 });
    }
}
