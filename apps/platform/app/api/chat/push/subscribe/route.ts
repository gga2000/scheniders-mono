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
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { isPushServiceEndpoint } from "@/lib/chat/push-endpoint";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    endpoint: z.string().min(1).max(2048).refine(isPushServiceEndpoint, "Not a browser push service"),
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

    // 3. The store this subscription belongs to: the caller's current store,
    //    only when they are an active member of it (never the raw
    //    current_tenant_id, which a member can point at any store).
    const active = await resolveActiveTenant(user.id);
    if (!active.ok) {
        return NextResponse.json({ error: active.error }, { status: active.status });
    }
    const tenantId = active.tenantId;

    // 4. One browser endpoint belongs to one user: when someone else signs in
    //    on a shared device, the previous user's row for it goes, so their
    //    alerts stop reaching this browser even if they never signed out here.
    const { error: claimError } = await createSupabaseServiceClient()
        .from("chat_push_subscriptions")
        .delete()
        .eq("endpoint", body.endpoint)
        .neq("user_id", user.id);
    if (claimError) {
        console.error("[push/subscribe] endpoint claim error:", claimError.message);
        return NextResponse.json({ error: "Failed to store subscription" }, { status: 500 });
    }

    // 5. Upsert using the user-scoped client so RLS (user_id = auth.uid()) is
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
