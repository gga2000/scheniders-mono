import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { PERMISSIONS } from "@/lib/permissions";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { pullBackPrimeShipment } from "@/lib/prime/pull-back";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ orderId: z.string().uuid() });

/**
 * POST /api/prime/pull-back — take a parcel back from Prime before pickup,
 * keeping the order. The shipment is read from the caller's own tenant,
 * never from the request body. Answers `{ ok: true }` once Prime deleted it
 * and the order is confirmed again, or `{ ok: false, reason }` so the card can
 * say why not.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const permission = await callerHasPermission(request, caller, PERMISSIONS.EDIT_ORDERS, "prime-pull-back");
    if (!permission.ok) return permission.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const merchant = client ? await loadPrimeMerchant(db, caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, ok: false, reason: "not_connected" });

    const { data: profile } = await db.from("user_profiles").select("display_name").eq("id", caller.userId).maybeSingle();
    const changedBy = typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim() : undefined;
    const result = await pullBackPrimeShipment(db, client, caller.tenantId, parsed.data.orderId, changedBy);
    return NextResponse.json({ success: true, ...result });
}
