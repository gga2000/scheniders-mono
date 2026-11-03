import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { primeConfigFromEnv } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";

export const dynamic = "force-dynamic";

/**
 * Whether this tenant's dispatch desk sends orders to Prime through the API
 * (otherwise it downloads the Prime Excel file). Any member may ask.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    if (!primeConfigFromEnv()) return NextResponse.json({ success: true, connected: false });
    const merchant = await loadPrimeMerchant(createSupabaseServiceClient(), caller.tenantId);
    return NextResponse.json({ success: true, connected: merchant !== null });
}
