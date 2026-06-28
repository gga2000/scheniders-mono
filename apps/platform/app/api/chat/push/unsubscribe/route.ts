// apps/platform/app/api/chat/push/unsubscribe/route.ts
//
// Deletes a web-push subscription from chat_push_subscriptions.
// Auth: bearer token. Uses the user-scoped Supabase client so RLS
// (user_id = auth.uid()) prevents deleting another user's subscriptions.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    verifyAccessToken,
    createSupabaseServerClientWithToken,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    endpoint: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    // 1. Auth.
    const raw = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!raw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, error: authError } = await verifyAccessToken(raw);
    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body.
    let body: z.infer<typeof bodySchema>;
    try {
        body = bodySchema.parse(await request.json());
    } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // 3. Delete using the user-scoped client — RLS ensures user_id = auth.uid(),
    //    so only the caller's own subscription rows are reachable.
    const supabase = createSupabaseServerClientWithToken(raw);
    const { error: deleteError } = await supabase
        .from("chat_push_subscriptions")
        .delete()
        .eq("endpoint", body.endpoint)
        .eq("user_id", user.id);

    if (deleteError) {
        console.error("[push/unsubscribe] delete error:", deleteError.message);
        return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
