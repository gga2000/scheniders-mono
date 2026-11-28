import { NextResponse } from "next/server";
import { withFailureReport } from "@/lib/job-monitor";
import { snoozePasswordReminder } from "@/lib/password-reminder";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password-reminder: "remind me later" on the weak password
 * reminder. The signed-in account is asked again a week from now.
 */
async function handlePOST(): Promise<NextResponse> {
    const session = await createSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    if (!auth.user) return NextResponse.json({ success: false, code: "unauthorized" }, { status: 401 });
    await snoozePasswordReminder(createSupabaseServiceClient(), auth.user.id);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/password-reminder POST", handlePOST);
