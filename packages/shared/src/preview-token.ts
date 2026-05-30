// =====================================================================
// preview-token — short-lived HMAC-signed tokens for the editor preview
// =====================================================================
// The storefront `/_preview/[tenant]/[page_id]` route gates rendering on
// a signed token so a leaked URL cannot be replayed indefinitely and
// cannot be forged without the server-side secret. We deliberately do
// NOT pull in a JWT library — Node's built-in `crypto` covers HMAC and
// constant-time comparison, and the token shape stays small/auditable.
//
// Token format (JWT-like but minimal):
//   <base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
//
// Payload shape: { tenant_id, iat, exp } (epoch seconds).
//
// Usage:
//   const token = signPreviewToken({ tenant_id }, secret, 3600);
//   const result = verifyPreviewToken(token, secret);
//   if (result.ok) { ... result.payload.tenant_id ... }
// =====================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export interface PreviewTokenPayload {
    tenant_id: string;
    iat: number; // issued-at, epoch seconds
    exp: number; // expiry, epoch seconds
}

export interface PreviewTokenInput {
    tenant_id: string;
}

export type VerifyResult =
    | { ok: true; payload: PreviewTokenPayload }
    | { ok: false; reason: VerifyFailureReason };

export type VerifyFailureReason =
    | "malformed"
    | "bad_signature"
    | "expired"
    | "invalid_payload";

/* ─────────────────────────────────────────────────────────────────── */
/* base64url helpers                                                    */
/* ─────────────────────────────────────────────────────────────────── */

function base64UrlEncode(buf: Buffer): string {
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
    // Restore padding so Buffer.from can decode standard base64.
    const padLen = (4 - (input.length % 4)) % 4;
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
    return Buffer.from(padded, "base64");
}

/* ─────────────────────────────────────────────────────────────────── */
/* sign / verify                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function hmacSign(message: string, secret: string): Buffer {
    return createHmac("sha256", secret).update(message).digest();
}

/**
 * Mint a signed preview token. `ttlSeconds` is enforced server-side at
 * verify time (the `exp` field is part of the signed payload).
 */
export function signPreviewToken(
    input: PreviewTokenInput,
    secret: string,
    ttlSeconds: number,
): string {
    if (!secret) throw new Error("signPreviewToken: secret is required");
    if (!input?.tenant_id) {
        throw new Error("signPreviewToken: tenant_id is required");
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error("signPreviewToken: ttlSeconds must be a positive number");
    }
    const now = Math.floor(Date.now() / 1000);
    const payload: PreviewTokenPayload = {
        tenant_id: input.tenant_id,
        iat: now,
        exp: now + Math.floor(ttlSeconds),
    };
    const payloadStr = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
    const sig = base64UrlEncode(hmacSign(payloadStr, secret));
    return `${payloadStr}.${sig}`;
}

/**
 * Verify a preview token. Returns a discriminated union so callers can
 * branch on the specific failure mode (useful for telemetry without
 * leaking detail to the client).
 *
 * Signature comparison is constant-time. Expiry is checked AFTER the
 * signature so a tampered payload can never expose timing about exp.
 */
export function verifyPreviewToken(
    token: string,
    secret: string,
): VerifyResult {
    if (!secret) return { ok: false, reason: "bad_signature" };
    if (typeof token !== "string" || token.length === 0) {
        return { ok: false, reason: "malformed" };
    }
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1) {
        return { ok: false, reason: "malformed" };
    }
    const payloadStr = token.slice(0, dot);
    const sigStr = token.slice(dot + 1);

    let providedSig: Buffer;
    try {
        providedSig = base64UrlDecode(sigStr);
    } catch {
        return { ok: false, reason: "malformed" };
    }
    const expectedSig = hmacSign(payloadStr, secret);
    if (
        providedSig.length !== expectedSig.length ||
        !timingSafeEqual(providedSig, expectedSig)
    ) {
        return { ok: false, reason: "bad_signature" };
    }

    let payload: PreviewTokenPayload;
    try {
        const json = base64UrlDecode(payloadStr).toString("utf8");
        const parsed = JSON.parse(json) as unknown;
        if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof (parsed as PreviewTokenPayload).tenant_id !== "string" ||
            typeof (parsed as PreviewTokenPayload).iat !== "number" ||
            typeof (parsed as PreviewTokenPayload).exp !== "number"
        ) {
            return { ok: false, reason: "invalid_payload" };
        }
        payload = parsed as PreviewTokenPayload;
    } catch {
        return { ok: false, reason: "invalid_payload" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
        return { ok: false, reason: "expired" };
    }
    return { ok: true, payload };
}
