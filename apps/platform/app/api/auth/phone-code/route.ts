import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { SIGNUP_CODE_RESEND_SECONDS, loadSignupWhatsApp, sendSignupCode, signupCodeWait } from "@/lib/signup-phone-code";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

// Each code is a paid WhatsApp message from Fermi's own number: a person
// needs a couple; a script pumping messages is stopped by the CAPTCHA, then
// by these.
const IP_LIMIT = 5;
const PHONE_LIMIT = 3;
const WINDOW_SECONDS = 60 * 60;
/** The switch is read on every signup page load. */
const SWITCH_LIMIT = 60;
const SWITCH_WINDOW_SECONDS = 10 * 60;

const sendSchema = z.object({
    phone: z.string().max(40),
    captcha_token: z.string().max(4096).optional(),
});

function tooMany(retryAfterSeconds: number): NextResponse {
    return NextResponse.json(
        { success: false, error: "too_many", retry_after: retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
}

/**
 * GET /api/auth/phone-code: whether signup asks for a WhatsApp code
 * (Fermi B11). Public: the signup page reads it before anyone has an account.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
    const limit = await consumeRateLimit(`signup-code-switch:${requestIp(request)}`, SWITCH_LIMIT, SWITCH_WINDOW_SECONDS);
    if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "signup-code-rate-limit" });
    if (!limit.allowed) {
        return NextResponse.json({ success: false, error: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, SWITCH_LIMIT) });
    }
    const settings = await loadSignupWhatsApp(createSupabaseServiceClient());
    return NextResponse.json({ success: true, data: { phone_code: settings.phone_code } }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/auth/phone-code { phone, captcha_token }: sends a 6-digit code on
 * WhatsApp to an Iraqi mobile, for signup to check. Only while the console's
 * switch is on.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const ip = requestIp(request);
    const byIp = await consumeRateLimit(`signup-code:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS);
    if (byIp.error) reportOrderError(new Error(`Rate limiter unavailable: ${byIp.error}`), { operation: "signup-code-rate-limit" });
    if (!byIp.allowed) {
        return NextResponse.json(
            { success: false, error: "too_many", retry_after: byIp.retryAfterSeconds },
            { status: 429, headers: rateLimitHeaders(byIp, IP_LIMIT) },
        );
    }

    const parsed = sendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "bad_phone" }, { status: 422 });
    const phone = normalizeIraqiMobile(parsed.data.phone);
    if (!phone) return NextResponse.json({ success: false, error: "bad_phone" }, { status: 422 });

    const db = createSupabaseServiceClient();
    const settings = await loadSignupWhatsApp(db);
    if (!settings.phone_code) return NextResponse.json({ success: false, error: "phone_code_off" }, { status: 404 });

    const captcha = await verifyTurnstile(parsed.data.captcha_token, ip === "unknown" ? null : ip);
    if (!captcha.ok) {
        if (captcha.reason === "unavailable") {
            reportOrderError(new Error("Turnstile siteverify unavailable"), { operation: "signup-code-captcha" });
            return NextResponse.json({ success: false, error: "captcha_unavailable" }, { status: 503 });
        }
        return NextResponse.json({ success: false, error: "captcha_failed" }, { status: 403 });
    }

    const wait = await signupCodeWait(db, phone);
    if (wait > 0) return tooMany(wait);
    const byPhone = await consumeRateLimit(`signup-code:phone:${phone}`, PHONE_LIMIT, WINDOW_SECONDS);
    if (byPhone.error) reportOrderError(new Error(`Rate limiter unavailable: ${byPhone.error}`), { operation: "signup-code-rate-limit" });
    if (!byPhone.allowed) return tooMany(byPhone.retryAfterSeconds);

    const sent = await sendSignupCode(db, phone, ip);
    if (!sent.ok) {
        reportOrderError(new Error(`Signup code not sent: ${sent.error}`), { operation: "signup-code-send" });
        return NextResponse.json({ success: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ success: true, data: { phone, resend_after: SIGNUP_CODE_RESEND_SECONDS } });
}

export const GET = withFailureReport("api/auth/phone-code GET", handleGET);
export const POST = withFailureReport("api/auth/phone-code POST", handlePOST);
