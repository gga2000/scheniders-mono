import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { loadPrimeLink } from "@/lib/prime/connection";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

/**
 * Whether this tenant ships through the Prime API (the dispatch desk sends
 * orders to Prime directly, and the orders page shows the Prime track), and
 * the Prime branch its parcels go through, and when Prime's statuses were
 * last read (screens call the link late past lib/prime/sync-health). Any
 * member may ask.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const link = await loadPrimeLink(createSupabaseServiceClient(), caller.tenantId);
    return NextResponse.json({
        success: true,
        connected: link !== null,
        branchName: link?.connection.branchName ?? null,
        syncedAt: link?.syncedAt ?? null,
    });
}

export const GET = withFailureReport("api/prime/connection GET", handleGET);
