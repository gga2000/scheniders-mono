import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { SIGNUP_CODE_PATTERN, checkSignupCode } from "@/lib/signup-phone-code";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Five wrong tries already lock each code; this keeps one address from
// working through many numbers.
const IP_LIMIT = 30;
const WINDOW_SECONDS = 60 * 60;

const verifySchema = z.object({
    phone: z.string().max(40),
    code: z.string().max(12),
});

const STATUS = { wrong: 422, locked: 429, expired: 410 } as const;

/**
 * POST /api/auth/phone-code/verify { phone, code }: checks the code sent on
 * WhatsApp (Fermi B11). The right code returns a proof that signup spends
 * once, within half an hour.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const limit = await consumeRateLimit(`signup-code-check:${requestIp(request)}`, IP_LIMIT, WINDOW_SECONDS);
    if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "signup-code-check-rate-limit" });
    if (!limit.allowed) {
        return NextResponse.json({ success: false, error: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, IP_LIMIT) });
    }

    const parsed = verifySchema.safeParse(await request.json().catch(() => null));
    const phone = parsed.success ? normalizeIraqiMobile(parsed.data.phone) : null;
    const code = parsed.success ? parsed.data.code.trim() : "";
    if (!phone || !SIGNUP_CODE_PATTERN.test(code)) return NextResponse.json({ success: false, error: "wrong" }, { status: 422 });

    const check = await checkSignupCode(createSupabaseServiceClient(), phone, code);
    if (check.result === "ok") return NextResponse.json({ success: true, data: { proof: check.proof } });
    return NextResponse.json({ success: false, error: check.result }, { status: STATUS[check.result] });
}

export const POST = withFailureReport("api/auth/phone-code/verify POST", handlePOST);
