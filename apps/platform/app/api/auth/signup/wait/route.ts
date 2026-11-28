import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { signupWaitOpen, signupWaitTicketMatches } from "@/lib/signup-wait";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// The page asks every few seconds for up to half an hour. Mobile carriers
// share addresses, so the per-address cap is wide; the per-account one is
// what a single open page needs, with room to spare.
const IP_LIMIT = 600;
const ACCOUNT_LIMIT = 200;
const WINDOW_SECONDS = 10 * 60;

const bodySchema = z.object({
    user_id: z.uuid(),
    ticket: z.string().min(16).max(128),
});

const notFound = () => NextResponse.json({ success: false, code: "unknown" }, { status: 404 });

/**
 * POST /api/auth/signup/wait { user_id, ticket }: whether the account the
 * sign-up page just made has confirmed its email (lib/signup-wait.ts). Answers
 * nothing about any account without its ticket.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
    const { user_id: userId, ticket } = parsed.data;

    for (const [key, max] of [[`signup-wait:ip:${requestIp(request)}`, IP_LIMIT], [`signup-wait:user:${userId}`, ACCOUNT_LIMIT]] as const) {
        const limit = await consumeRateLimit(key, max, WINDOW_SECONDS);
        if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "signup-wait-rate-limit" });
        if (!limit.allowed) {
            return NextResponse.json({ success: false, code: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, max) });
        }
    }

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return notFound();
    const user = data.user;
    if (!signupWaitTicketMatches(ticket, user.app_metadata?.signup_wait)) return notFound();
    if (!signupWaitOpen(user.created_at)) return NextResponse.json({ success: false, code: "expired" }, { status: 410 });

    const confirmed = Boolean(user.email_confirmed_at);
    if (confirmed) {
        // Its one question is answered: the ticket stops working and leaves the account.
        const { error: clearError } = await admin.auth.admin.updateUserById(userId, { app_metadata: { signup_wait: null } });
        if (clearError) reportOrderError(new Error(`signup_wait not cleared: ${clearError.message}`), { operation: "signup-wait-clear" });
    }
    return NextResponse.json({ success: true, data: { confirmed } }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/signup/wait POST", handlePOST);
