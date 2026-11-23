import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const listRows = z.array(
    z.object({ id: z.string().uuid(), label: z.string(), created_at: z.string(), last_used_at: z.string().nullable() }),
);

async function signedInUserId(): Promise<string | null> {
    const session = await createSupabaseServerClient();
    const { data } = await session.auth.getUser();
    return data.user?.id ?? null;
}

/** GET /api/auth/passkey: the signed-in user's own passkeys, for Settings. Never the keys themselves. */
async function handleGET(): Promise<NextResponse> {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    const { data, error } = await createSupabaseServiceClient()
        .from("user_passkeys")
        .select("id, label, created_at, last_used_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(`passkey list failed: ${error.message}`);
    return NextResponse.json({ success: true, data: listRows.parse(data) }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/auth/passkey?id=…: removes one of the signed-in user's own passkeys. */
async function handleDELETE(request: NextRequest): Promise<NextResponse> {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return NextResponse.json({ success: false, error: "bad_request" }, { status: 422 });
    // Scoped to the caller: someone else's id matches no row.
    const { error } = await createSupabaseServiceClient().from("user_passkeys").delete().eq("id", id.data).eq("user_id", userId);
    if (error) throw new Error(`passkey delete failed: ${error.message}`);
    return NextResponse.json({ success: true });
}

export const GET = withFailureReport("api/auth/passkey GET", handleGET);
export const DELETE = withFailureReport("api/auth/passkey DELETE", handleDELETE);
