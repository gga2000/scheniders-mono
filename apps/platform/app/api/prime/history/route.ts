import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { loadPrimeJourney } from "@/lib/prime/journey";

export const dynamic = "force-dynamic";

const querySchema = z.object({ orderId: z.string().uuid() });

/**
 * GET /api/prime/history?orderId=… — the parcel's journey at Prime, newest
 * step first, for the order card's Prime panel. Any member may read it. The
 * shipment is looked up in the caller's own tenant, never from the request.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = querySchema.safeParse({ orderId: request.nextUrl.searchParams.get("orderId") });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, caller.tenantId) : null;
    if (!client || !connection) return NextResponse.json({ success: true, ok: false, reason: "not_connected" });

    const journey = await loadPrimeJourney(db, client, caller.tenantId, parsed.data.orderId);
    return NextResponse.json({ success: true, ...journey });
}
