import { startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { z } from "zod";

/**
 * Browser side of passkey sign-in: talks to /api/auth/passkey/* and to the
 * device's fingerprint, face or PIN prompt.
 */

export type PasskeyOutcome =
    | { ok: true }
    /** `cancelled`: the person closed the prompt, so nothing is shown. `exists`: this device already has one. */
    | { ok: false, reason: "cancelled" | "exists" | "too_many" | "failed" };

/** True when this device can keep a passkey behind its own fingerprint, face or PIN. */
export async function devicePasskeyAvailable(): Promise<boolean> {
    if (typeof window === "undefined" || typeof window.PublicKeyCredential === "undefined") return false;
    return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

const optionsReply = z.object({
    success: z.literal(true),
    // The server builds these with @simplewebauthn/server; the browser library reads them as is.
    data: z.object({ challenge_id: z.string().uuid(), options: z.record(z.string(), z.unknown()) }),
});

async function post(path: string, body?: unknown): Promise<Response> {
    return fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function failure(error: unknown): PasskeyOutcome {
    if (error instanceof WebAuthnError && error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return { ok: false, reason: "exists" };
    // The browser reports a closed or timed-out prompt as NotAllowedError (also AbortError when another prompt replaces it).
    if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")) return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
}

/** Signs in with a passkey; on success the session is in the cookies and the page should be loaded fresh. */
export async function signInWithPasskey(): Promise<PasskeyOutcome> {
    const start = await post("/api/auth/passkey/signin/options");
    if (start.status === 429) return { ok: false, reason: "too_many" };
    const parsed = optionsReply.safeParse(await start.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: "failed" };
    try {
        const optionsJSON = parsed.data.data.options as unknown as PublicKeyCredentialRequestOptionsJSON;
        const response = await startAuthentication({ optionsJSON });
        const done = await post("/api/auth/passkey/signin/verify", { challenge_id: parsed.data.data.challenge_id, response });
        if (done.status === 429) return { ok: false, reason: "too_many" };
        return done.ok ? { ok: true } : { ok: false, reason: "failed" };
    } catch (error) {
        return failure(error);
    }
}

/** Makes a passkey on this device for the signed-in user. */
export async function registerPasskey(): Promise<PasskeyOutcome> {
    const start = await post("/api/auth/passkey/register/options");
    const parsed = optionsReply.safeParse(await start.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: "failed" };
    try {
        const optionsJSON = parsed.data.data.options as unknown as PublicKeyCredentialCreationOptionsJSON;
        const response = await startRegistration({ optionsJSON });
        const done = await post("/api/auth/passkey/register/verify", { challenge_id: parsed.data.data.challenge_id, response });
        return done.ok ? { ok: true } : { ok: false, reason: "failed" };
    } catch (error) {
        return failure(error);
    }
}

const listReply = z.object({
    success: z.literal(true),
    data: z.array(z.object({ id: z.string(), label: z.string(), created_at: z.string(), last_used_at: z.string().nullable() })),
});
export type PasskeySummary = z.infer<typeof listReply>["data"][number];

export async function listPasskeys(): Promise<PasskeySummary[]> {
    const reply = listReply.safeParse(await (await fetch("/api/auth/passkey")).json().catch(() => null));
    if (!reply.success) throw new Error("Could not load passkeys");
    return reply.data.data;
}

export async function deletePasskey(id: string): Promise<boolean> {
    return (await fetch(`/api/auth/passkey?id=${encodeURIComponent(id)}`, { method: "DELETE" })).ok;
}
