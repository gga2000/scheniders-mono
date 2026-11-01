import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { syncMetaAdsForTenant } from "@/lib/meta-ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const connectSchema = z.object({
    adAccountId: z.string().regex(/^[0-9]{5,20}$/, "Digits only, no act_ prefix"),
    accessToken: z.string().min(21),
    usdToIqd: z.number().int().min(1000).max(3000),
});

/** Masked status. The token is never returned. Any member may see it (page shows sync health). */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const { data, error } = await createSupabaseServiceClient()
        .from("meta_ads_connections")
        .select("ad_account_id, usd_to_iqd, is_active, last_synced_at, last_error")
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, connection: data });
}

/** Save credentials (tenant admins only), then run a first sync so a bad token fails loudly now. */
export async function PUT(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = connectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { adAccountId, accessToken, usdToIqd } = parsed.data;

    const db = createSupabaseServiceClient();
    const { error } = await db.from("meta_ads_connections").upsert(
        {
            tenant_id: caller.tenantId,
            ad_account_id: adAccountId,
            access_token: accessToken,
            usd_to_iqd: usdToIqd,
            is_active: true,
            last_error: null,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
    );
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const outcome = await syncMetaAdsForTenant(db, {
        tenant_id: caller.tenantId,
        ad_account_id: adAccountId,
        access_token: accessToken,
        usd_to_iqd: usdToIqd,
    });
    return NextResponse.json({ success: outcome.ok, rows: outcome.rows, error: outcome.error });
}

/** "Sync now" (tenant admins only). */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const db = createSupabaseServiceClient();
    const { data: conn, error } = await db
        .from("meta_ads_connections")
        .select("tenant_id, ad_account_id, access_token, usd_to_iqd")
        .eq("tenant_id", caller.tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!conn) return NextResponse.json({ success: false, error: "Meta Ads is not connected" }, { status: 404 });

    const outcome = await syncMetaAdsForTenant(db, conn);
    return NextResponse.json({ success: outcome.ok, rows: outcome.rows, error: outcome.error });
}
