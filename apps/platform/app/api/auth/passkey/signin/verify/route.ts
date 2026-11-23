import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { reportOrderError } from "@/lib/order-telemetry";
import { knownTransports, passkeyRelyingParty, storedPasskey, takePasskeyChallenge } from "@/lib/passkey-server";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const IP_LIMIT = 20;
const WINDOW_SECONDS = 10 * 60;

const bodySchema = z.object({
    challenge_id: z.string().uuid(),
    // Checked field by field by verifyAuthenticationResponse; here only its outline.
    response: z
        .object({ id: z.string().max(2048), rawId: z.string().max(2048), type: z.literal("public-key"), response: z.record(z.string(), z.unknown()) })
        .passthrough(),
});

/** One answer for every way a sign-in can be refused, so the reply never says which passkeys exist. */
function refused(): NextResponse {
    return NextResponse.json({ success: false, error: "not_verified" }, { status: 401 });
}

/**
 * POST /api/auth/passkey/signin/verify: checks the browser's signature against
 * the stored public key and, when it holds, opens a normal Supabase session in
 * the cookies, the same way the email-link route does (a one-time token made
 * with the service role and redeemed at once, never sent anywhere).
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const limit = await consumeRateLimit(`passkey-signin-verify:${requestIp(request)}`, IP_LIMIT, WINDOW_SECONDS);
    if (limit.error) reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "passkey-rate-limit" });
    if (!limit.allowed) {
        return NextResponse.json({ success: false, error: "too_many" }, { status: 429, headers: rateLimitHeaders(limit, IP_LIMIT) });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "bad_request" }, { status: 422 });

    const service = createSupabaseServiceClient();
    const challenge = await takePasskeyChallenge(service, parsed.data.challenge_id, "signin");
    if (!challenge) return NextResponse.json({ success: false, error: "expired" }, { status: 400 });

    const found = await service
        .from("user_passkeys")
        .select("id, user_id, credential_id, public_key, counter, transports")
        .eq("credential_id", parsed.data.response.id)
        .maybeSingle();
    if (found.error) throw new Error(`passkey lookup failed: ${found.error.message}`);
    if (!found.data) return refused();
    const passkey = storedPasskey.parse(found.data);

    const { rpID, origin } = passkeyRelyingParty(request);
    // The outline was checked above; the library validates every field it reads.
    const response = parsed.data.response as unknown as AuthenticationResponseJSON;
    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
            id: passkey.credential_id,
            publicKey: isoBase64URL.toBuffer(passkey.public_key),
            counter: passkey.counter,
            transports: knownTransports(passkey.transports),
        },
    }).catch(() => null);
    if (!verification?.verified) return refused();

    const touched = await service
        .from("user_passkeys")
        .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq("id", passkey.id);
    if (touched.error) throw new Error(`passkey counter update failed: ${touched.error.message}`);

    const owner = await service.auth.admin.getUserById(passkey.user_id);
    const email = owner.data.user?.email;
    if (owner.error || !email) return refused();
    const link = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw new Error(`passkey session link failed: ${link.error.message}`);

    const session = await createSupabaseServerClient();
    const opened = await session.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    // A banned or deleted account is refused here by Supabase itself.
    if (opened.error) return refused();
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/passkey/signin/verify POST", handlePOST);
