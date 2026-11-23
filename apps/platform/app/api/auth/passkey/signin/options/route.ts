import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { passkeyRelyingParty, savePasskeyChallenge } from "@/lib/passkey-server";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Public and writes a row per call: a person asks a few times, a script is stopped here.
const IP_LIMIT = 30;
const WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/auth/passkey/signin/options: a challenge for the browser to sign
 * with whichever passkey its owner picks. No email is asked: the passkey
 * itself says whose it is.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const limit = await consumeRateLimit(`passkey-signin-options:${requestIp(request)}`, IP_LIMIT, WINDOW_SECONDS);
    if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "passkey-rate-limit" });
    if (!limit.allowed) {
        return NextResponse.json({ success: false, error: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, IP_LIMIT) });
    }
    const { rpID } = passkeyRelyingParty(request);
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    const challengeId = await savePasskeyChallenge(createSupabaseServiceClient(), options.challenge, "signin", null);
    return NextResponse.json({ success: true, data: { challenge_id: challengeId, options } }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/passkey/signin/options POST", handlePOST);
