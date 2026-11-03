import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { sendOrdersToPrime } from "@/lib/prime/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A dispatch run: ~40-85 orders a day today. */
const bodySchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(300) });

/**
 * POST /api/prime/send — hand a dispatch run's orders to Prime.
 *
 * The orders are read from the caller's own tenant (never from the request
 * body), so a member can only send their store's orders. Answers
 * `connected: false` when the tenant has no Prime API link; the desk then
 * downloads the Excel file as before. Each order lands in `sent` or `failed`.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    if (!hasPermission(caller.role, PERMISSIONS.EDIT_ORDERS)) {
        return NextResponse.json({ success: false, error: "You cannot ship orders." }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const merchant = client ? await loadPrimeMerchant(db, caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, connected: false });

    const outcome = await sendOrdersToPrime(db, client, caller.tenantId, merchant, [...new Set(parsed.data.orderIds)]);
    return NextResponse.json({ success: true, connected: true, ...outcome });
}
