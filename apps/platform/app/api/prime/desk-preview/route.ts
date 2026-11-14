import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { previewPrimeRun } from "@/lib/prime/desk-preview";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

/** The desk's whole queue at once; a day's queue is a few hundred orders at most. */
const bodySchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(500) });

/**
 * POST /api/prime/desk-preview — for each desk order: Prime's charge, or what
 * must be fixed before Prime takes it, and its case number once sent. Read
 * only: nothing is sent to Prime. Orders come from the caller's own tenant.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const merchant = client ? await loadPrimeMerchant(db, caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, connected: false });

    const rows = await previewPrimeRun(db, client, caller.tenantId, merchant, [...new Set(parsed.data.orderIds)]);
    return NextResponse.json({ success: true, connected: true, rows });
}

export const POST = withFailureReport("api/prime/desk-preview POST", handlePOST);
