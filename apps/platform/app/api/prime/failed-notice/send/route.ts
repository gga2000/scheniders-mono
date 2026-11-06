import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { sendPrimeFailedNoticeByHand, type PrimeFailedNoticeHandResult } from "@/lib/prime/failed-notice";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ orderId: z.string().uuid() });

const REFUSED: Record<Exclude<PrimeFailedNoticeHandResult, "sent">, { status: number; error: string }> = {
    failed: { status: 502, error: "WhatsApp refused the message." },
    not_sendable: { status: 409, error: "This parcel was already warned, or has no failed attempt open." },
    not_found: { status: 404, error: "Parcel not found" },
    no_host: { status: 503, error: "Sending works only on the live app." },
};

/**
 * POST /api/prime/failed-notice/send — send the failed-delivery WhatsApp to
 * one order's customer now, by hand (orders «معالجة» band, Prime problems
 * tab). Body: { orderId }. The parcel is read from the caller's own tenant;
 * it goes out once per parcel, counting the automatic send.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    if (!hasPermission(caller.role, PERMISSIONS.EDIT_ORDERS)) {
        return NextResponse.json({ success: false, error: "You cannot change orders." }, { status: 403 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const db = createSupabaseServiceClient();
    const { data: profile } = await db.from("user_profiles").select("display_name").eq("id", caller.userId).maybeSingle();
    const name = typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim().slice(0, 100) : "—";

    const result = await sendPrimeFailedNoticeByHand(db, caller.tenantId, parsed.data.orderId, name, Date.now());
    if (result === "sent") return NextResponse.json({ success: true });
    const refused = REFUSED[result];
    return NextResponse.json({ success: false, error: refused.error }, { status: refused.status });
}
