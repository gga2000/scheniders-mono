import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { passkeyDeviceLabel } from "@/lib/passkey-device";
import { knownTransports, passkeyRelyingParty, takePasskeyChallenge } from "@/lib/passkey-server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    challenge_id: z.string().uuid(),
    // Checked field by field by verifyRegistrationResponse; here only its outline.
    response: z
        .object({ id: z.string().max(2048), rawId: z.string().max(2048), type: z.literal("public-key"), response: z.record(z.string(), z.unknown()) })
        .passthrough(),
});

/**
 * POST /api/auth/passkey/register/verify: checks the passkey the browser just
 * made against the challenge this user was given, then stores its public key.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const session = await createSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "bad_request" }, { status: 422 });

    const service = createSupabaseServiceClient();
    const challenge = await takePasskeyChallenge(service, parsed.data.challenge_id, "register");
    if (!challenge || challenge.user_id !== user.id) {
        return NextResponse.json({ success: false, error: "expired" }, { status: 400 });
    }

    const { rpID, origin } = passkeyRelyingParty(request);
    // The outline was checked above; the library validates every field it reads.
    const response = parsed.data.response as unknown as RegistrationResponseJSON;
    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
    }).catch(() => null);
    if (!verification?.verified || !verification.registrationInfo) {
        return NextResponse.json({ success: false, error: "not_verified" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const { error } = await service.from("user_passkeys").insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: knownTransports(credential.transports),
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        label: passkeyDeviceLabel(request.headers.get("user-agent")),
    });
    if (error) throw new Error(`passkey save failed: ${error.message}`);
    return NextResponse.json({ success: true });
}

export const POST = withFailureReport("api/auth/passkey/register/verify POST", handlePOST);
