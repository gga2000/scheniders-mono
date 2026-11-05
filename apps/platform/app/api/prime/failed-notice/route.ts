import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { PRIME_FAILED_NOTICE_KEY, primeFailedNoticeSetting } from "@/lib/prime/failed-notice";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ enabled: z.boolean() });

/** GET /api/prime/failed-notice — whether the caller's store sends the failed-delivery WhatsApp. */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const { data, error } = await createSupabaseServiceClient()
        .from("app_settings")
        .select("value")
        .eq("key", PRIME_FAILED_NOTICE_KEY)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, ...primeFailedNoticeSetting(data?.value) });
}

/** PUT /api/prime/failed-notice — switch it on or off (store admins only). Body: { enabled }. */
export async function PUT(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    const { error } = await createSupabaseServiceClient()
        .from("app_settings")
        .upsert({ key: PRIME_FAILED_NOTICE_KEY, tenant_id: caller.tenantId, value: { enabled: parsed.data.enabled } }, { onConflict: "key,tenant_id" });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, enabled: parsed.data.enabled });
}
