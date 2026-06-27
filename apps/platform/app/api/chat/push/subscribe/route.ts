// apps/platform/app/api/chat/push/subscribe/route.ts
//
// Upserts a web-push subscription into chat_push_subscriptions.
// Auth: bearer token (same pattern as /api/chat/unfurl and /api/settings/*).
// RLS: the client token is used so auth.uid() = user_id inside the upsert —
// self-RLS on chat_push_subscriptions holds without needing the service role.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    verifyAccessToken,
    createSupabaseServerClientWithToken,
    createSupabaseServiceClient,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    endpoint: z.string().min(1),
    p256dh: z.string().min(1),
    auth: z.string().min(1),
    userAgent: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    // 1. Auth — verify the bearer token.
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

    // 3. Resolve tenant_id from user_profiles (needed for the row).
    const service = createSupabaseServiceClient();
    const { data: profile } = await service
        .from("user_profiles")
        .select("current_tenant_id")
        .eq("id", user.id)
        .maybeSingle();

    const tenantId = (profile?.current_tenant_id as string | undefined) ?? null;

    // 4. Upsert using the user-scoped client so RLS (user_id = auth.uid()) is
    //    satisfied naturally — the anon key + user JWT means auth.uid() = user.id.
    const supabase = createSupabaseServerClientWithToken(raw);
    const { error: upsertError } = await supabase.from("chat_push_subscriptions").upsert(
        {
            user_id: user.id,
            tenant_id: tenantId,
            endpoint: body.endpoint,
            p256dh: body.p256dh,
            auth: body.auth,
            user_agent: body.userAgent ?? null,
        },
        { onConflict: "user_id,endpoint" }
    );

    if (upsertError) {
        console.error("[push/subscribe] upsert error:", upsertError.message);
        return NextResponse.json({ error: "Failed to store subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
