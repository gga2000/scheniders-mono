import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordIsWeak } from "@/lib/password-policy";
import { recordPasswordStrength } from "@/lib/password-reminder";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CHANGE_LIMIT = 10;
const CHANGE_WINDOW_SECONDS = 10 * 60;

const bodySchema = z.object({
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

/**
 * POST /api/auth/password { password }: sets a new password on the signed-in
 * account (the new-password page, after a reset link or from the weak
 * password reminder). Supabase holds it to its own rules; any password it
 * takes is accepted here, and one called weak keeps a reminder a week on
 * (lib/password-reminder.ts) while a stronger one clears it.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
    }
    const { password } = parsed.data;

    const session = await createSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ success: false, code: "unauthorized" }, { status: 401 });

    const limit = await consumeRateLimit(`password-change:${user.id}`, CHANGE_LIMIT, CHANGE_WINDOW_SECONDS);
    if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "password-change-rate-limit" });
    if (!limit.allowed) {
        return NextResponse.json({ success: false, code: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, CHANGE_LIMIT) });
    }

    const { error } = await session.auth.updateUser({ password });
    if (error) {
        if (isAuthWeakPasswordError(error)) {
            return NextResponse.json({ success: false, code: "weak_password", reasons: error.reasons }, { status: 422 });
        }
        if (error.code === "same_password") {
            return NextResponse.json({ success: false, code: "same_password" }, { status: 422 });
        }
        // Supabase's "Secure password change": a session older than a day
        // must prove itself again; the page sends a reset link instead.
        if (error.code === "reauthentication_needed") {
            return NextResponse.json({ success: false, code: "reauthentication_needed" }, { status: 403 });
        }
        return NextResponse.json({ success: false, code: "failed", error: error.message }, { status: 400 });
    }

    // The password is changed: a reminder that could not be saved is the
    // team's to fix, never a reason to tell the owner it failed.
    try {
        await recordPasswordStrength(createSupabaseServiceClient(), user.id, password);
    } catch (reminderError) {
        reportOrderError(reminderError, { operation: "password-reminder-record" });
    }
    return NextResponse.json({ success: true, data: { weak: passwordIsWeak(password) } }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/password POST", handlePOST);
