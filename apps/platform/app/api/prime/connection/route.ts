import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { primeConfigFromEnv } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

/**
 * Whether this tenant ships through the Prime API (the dispatch desk sends
 * orders to Prime directly, and the orders page shows the Prime track), and
 * the Prime branch its parcels go through. Any member may ask.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    if (!primeConfigFromEnv()) return NextResponse.json({ success: true, connected: false, branchName: null });
    const connection = await loadPrimeConnection(createSupabaseServiceClient(), caller.tenantId);
    return NextResponse.json({ success: true, connected: connection !== null, branchName: connection?.branchName ?? null });
}

export const GET = withFailureReport("api/prime/connection GET", handleGET);
