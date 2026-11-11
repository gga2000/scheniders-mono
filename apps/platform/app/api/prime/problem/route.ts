import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { PERMISSIONS } from "@/lib/permissions";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("handled"), orderId: z.string().uuid(), note: z.string().trim().max(300).optional() }),
    z.object({ action: z.literal("reopen"), orderId: z.string().uuid() }),
]);

/**
 * POST /api/prime/problem — the problems tab's "handled" mark on a parcel.
 * {action:"handled", orderId, note?} records who handled it and when, so
 * the team does not call twice; {action:"reopen"} takes the mark off. The
 * parcel is read from the caller's own tenant, never from the body. The mark
 * stops counting once Prime moves the parcel again (lib/prime/problems).
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const permission = await callerHasPermission(request, caller, PERMISSIONS.EDIT_ORDERS, "prime-problem");
    if (!permission.ok) return permission.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const db = createSupabaseServiceClient();
    let fields: { problem_checked_at: string | null; problem_checked_by: string | null; problem_note: string | null };
    if (parsed.data.action === "handled") {
        const { data: profile } = await db.from("user_profiles").select("display_name").eq("id", caller.userId).maybeSingle();
        const name = typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim().slice(0, 100) : null;
        fields = { problem_checked_at: new Date().toISOString(), problem_checked_by: name, problem_note: parsed.data.note || null };
    } else {
        fields = { problem_checked_at: null, problem_checked_by: null, problem_note: null };
    }

    const { data, error } = await db
        .from("prime_shipments")
        .update(fields)
        .eq("tenant_id", caller.tenantId)
        .eq("order_id", parsed.data.orderId)
        .select("id");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ success: false, error: "Parcel not found" }, { status: 404 });
    return NextResponse.json({ success: true });
}
