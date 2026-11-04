import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { loadPrimeCallChecks } from "@/lib/prime/call-check-load";

export const dynamic = "force-dynamic";

/** The cards on screen at once; the orders page asks in small batches as cards appear. */
const bodySchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(100) });

/**
 * POST /api/prime/call-check — for each order waiting on its confirmation
 * call: the customer's earlier parcels with Prime and how they ended, and
 * Prime's fee for this one (or what to fix before Prime would take it). Read
 * only. Orders come from the caller's own tenant; any member may ask.
 */
export async function POST(request: NextRequest) {
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

    const checks = await loadPrimeCallChecks(db, client, caller.tenantId, merchant, [...new Set(parsed.data.orderIds)]);
    return NextResponse.json({ success: true, connected: true, checks });
}
