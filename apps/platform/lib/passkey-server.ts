import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Server side of passkey sign-in. Tables: user_passkeys, passkey_challenges
 * (migration 20261122175500). Both are written with the service role only,
 * after the route has verified who is asking.
 */

export type PasskeyPurpose = "register" | "signin";

/** Who the browser is signing for. A passkey only works on the host it was made on, which the browser enforces. */
export function passkeyRelyingParty(request: NextRequest): { rpID: string; origin: string; rpName: string } {
    const url = new URL(request.url);
    return { rpID: url.hostname, origin: url.origin, rpName: "Fermi" };
}

const TRANSPORTS = ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"] as const;
const transportSchema = z.enum(TRANSPORTS);

/** Keeps the transports the WebAuthn spec knows; a browser may send newer ones. */
export function knownTransports(values: readonly string[] | null | undefined): AuthenticatorTransportFuture[] {
    return (values ?? []).flatMap((value) => {
        const parsed = transportSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
    });
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** Stores a fresh challenge and returns its id; expired ones are swept on the way. */
export async function savePasskeyChallenge(
    service: ServiceClient,
    challenge: string,
    purpose: PasskeyPurpose,
    userId: string | null,
): Promise<string> {
    const swept = await service.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString());
    if (swept.error) throw new Error(`passkey challenge sweep failed: ${swept.error.message}`);
    const { data, error } = await service
        .from("passkey_challenges")
        .insert({ challenge, purpose, user_id: userId })
        .select("id")
        .single();
    if (error) throw new Error(`passkey challenge save failed: ${error.message}`);
    return z.object({ id: z.string().uuid() }).parse(data).id;
}

const challengeRow = z.object({ challenge: z.string(), user_id: z.string().uuid().nullable() });

/**
 * Takes a challenge out of the table. Deleting and reading in one statement
 * makes it single-use: a second request with the same id gets nothing.
 */
export async function takePasskeyChallenge(
    service: ServiceClient,
    id: string,
    purpose: PasskeyPurpose,
): Promise<z.infer<typeof challengeRow> | null> {
    const { data, error } = await service
        .from("passkey_challenges")
        .delete()
        .eq("id", id)
        .eq("purpose", purpose)
        .gt("expires_at", new Date().toISOString())
        .select("challenge, user_id")
        .maybeSingle();
    if (error) throw new Error(`passkey challenge read failed: ${error.message}`);
    return data ? challengeRow.parse(data) : null;
}

export const storedPasskey = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    credential_id: z.string(),
    public_key: z.string(),
    counter: z.coerce.number(),
    transports: z.array(z.string()),
});
