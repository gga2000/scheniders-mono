import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { PERMISSIONS } from "@/lib/permissions";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { resendPrimeShipment } from "@/lib/prime/resend";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    orderId: z.string().uuid(),
    /** For Prime's agent ("customer asked for evening"), sent as the resend remark. */
    note: z.string().trim().max(200).optional(),
});

/**
 * POST /api/prime/resend — ask Prime to send a returned parcel out again.
 *
 * The order and its shipment are read from the caller's own tenant, never
 * from the request body. Answers `{ ok: true }` once Prime took the request,
 * or `{ ok: false, reason }` (and Prime's own words when it refused) so the
 * card can say what to fix.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const permission = await callerHasPermission(request, caller, PERMISSIONS.EDIT_ORDERS, "prime-resend");
    if (!permission.ok) return permission.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const merchant = client ? await loadPrimeMerchant(db, caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, ok: false, reason: "not_connected" });

    const result = await resendPrimeShipment(db, client, caller.tenantId, merchant, parsed.data.orderId, parsed.data.note);
    return NextResponse.json({ success: true, ...result });
}
