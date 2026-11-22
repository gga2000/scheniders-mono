import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withFailureReport } from "@/lib/job-monitor";
import { knownTransports, passkeyRelyingParty, savePasskeyChallenge } from "@/lib/passkey-server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** A person rarely needs more than their phone, laptop and a spare. */
const MAX_PASSKEYS = 10;

const existingRows = z.array(z.object({ credential_id: z.string(), transports: z.array(z.string()) }));

/**
 * POST /api/auth/passkey/register/options: what the browser needs to create a
 * passkey for the signed-in user. Signed-in only: a passkey is added to an
 * account its owner has already opened another way.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
    const session = await createSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    const user = auth.user;
    if (!user?.email) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const service = createSupabaseServiceClient();
    const existing = await service.from("user_passkeys").select("credential_id, transports").eq("user_id", user.id);
    if (existing.error) throw new Error(`passkey list failed: ${existing.error.message}`);
    const rows = existingRows.parse(existing.data);
    if (rows.length >= MAX_PASSKEYS) return NextResponse.json({ success: false, error: "too_many_passkeys" }, { status: 409 });

    const { rpID, rpName } = passkeyRelyingParty(request);
    const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: user.email,
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        // The device already holding a passkey for this account refuses to make a second.
        excludeCredentials: rows.map((row) => ({ id: row.credential_id, transports: knownTransports(row.transports) })),
        // Discoverable + verified: sign-in needs no email, and always a fingerprint, face or PIN.
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const challengeId = await savePasskeyChallenge(service, options.challenge, "register", user.id);
    return NextResponse.json({ success: true, data: { challenge_id: challengeId, options } }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withFailureReport("api/auth/passkey/register/options POST", handlePOST);
