import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Inbound webhook authentication with a staged rollout.
 *
 * LightFunnels and Interakt both posted to endpoints that accepted a request
 * carrying NO credential at all — only a present-and-wrong secret was refused.
 * Anyone who knew the URL could create orders (which fan out WhatsApp sends and
 * staff alerts) or confirm/cancel a merchant's orders.
 *
 * Switching straight to "reject when missing" would also reject the real
 * traffic, because neither dashboard was configured to send a credential. So
 * the check runs in one of two modes:
 *
 *   monitor  (default) — a request with no credential is still processed, and a
 *            structured warning is logged so the owner can see whether the real
 *            traffic is authenticated yet.
 *   enforce  — a request with no credential is refused with 401.
 *
 * A credential that is present but WRONG is refused in both modes: nothing
 * legitimate sends a bad one, and that was already the behaviour before.
 *
 * Accepted credentials, strongest first:
 *   - an HMAC signature header over the raw body (provider-specific scheme);
 *   - the shared secret in a header (`x-webhook-secret`, ...);
 *   - the shared secret as a `?token=` query parameter — for dashboards that
 *     let you paste a URL but not add a header.
 */

export const WEBHOOK_AUTH_MODES = ["monitor", "enforce"] as const;
export type WebhookAuthMode = (typeof WEBHOOK_AUTH_MODES)[number];

export const WEBHOOK_TOKEN_PARAM = "token";

export interface HmacScheme {
    /** Header carrying the signature, e.g. `interakt-signature`. */
    header: string;
    /** Key the provider signs with. Unset → the header is ignored (cannot be verified). */
    secret: string | undefined;
    encoding: "hex" | "base64";
    /** Literal prefix on the header value, e.g. `sha256=`. */
    prefix?: string;
    /**
     * LightFunnels' reference implementation signs `JSON.stringify(req.body)`
     * — the re-serialised body — rather than the bytes on the wire. When set,
     * a signature over the compact re-serialisation is accepted as well.
     */
    acceptReserializedBody?: boolean;
}

export interface WebhookAuthConfig {
    /** Shared secret accepted from `secretHeaders` or `?token=`. */
    sharedSecret: string | undefined;
    secretHeaders: readonly string[];
    hmac?: HmacScheme;
}

export type WebhookCredential = "hmac" | "header" | "token";

export interface WebhookAuthPresence {
    has_hmac: boolean;
    has_header: boolean;
    has_token: boolean;
}

export type WebhookAuthResult =
    | ({ status: "authenticated"; method: WebhookCredential } & WebhookAuthPresence)
    | ({ status: "invalid"; method: WebhookCredential } & WebhookAuthPresence)
    /** A secret is configured, but the request presented nothing we could check. */
    | ({ status: "missing" } & WebhookAuthPresence)
    /** No secret is configured on our side, so nothing can be checked. */
    | ({ status: "unconfigured" } & WebhookAuthPresence);

/**
 * Compare two secrets without leaking, through timing, where they diverge or
 * how long the expected one is: both sides are hashed to a fixed length first.
 */
export function constantTimeEqual(a: string, b: string): boolean {
    const da = createHash("sha256").update(a, "utf8").digest();
    const db = createHash("sha256").update(b, "utf8").digest();
    return timingSafeEqual(da, db);
}

function reserialize(rawBody: string): string | null {
    try {
        return JSON.stringify(JSON.parse(rawBody));
    } catch {
        // Not JSON: there is no re-serialised form to check, only the raw bytes.
        return null;
    }
}

function verifyHmac(scheme: HmacScheme & { secret: string }, provided: string, rawBody: string): boolean {
    const prefix = scheme.prefix ?? "";
    if (prefix && !provided.toLowerCase().startsWith(prefix.toLowerCase())) return false;
    const signature = provided.slice(prefix.length).trim();

    const sign = (body: string) =>
        createHmac("sha256", scheme.secret).update(body, "utf8").digest(scheme.encoding);
    // Hex digests are case-insensitive; base64 is not.
    const normalise = (s: string) => (scheme.encoding === "hex" ? s.toLowerCase() : s);

    const bodies = [rawBody];
    if (scheme.acceptReserializedBody) {
        const alt = reserialize(rawBody);
        if (alt !== null && alt !== rawBody) bodies.push(alt);
    }
    // Evaluate every candidate so timing does not reveal which form matched.
    return bodies
        .map(body => constantTimeEqual(normalise(sign(body)), normalise(signature)))
        .some(Boolean);
}

/**
 * Pure decision: inspects the request's credentials against the configured
 * secrets. Does not consult the mode — see `resolveWebhookAuth`.
 */
export function verifyWebhookAuth(
    input: { headers: Headers; url: string; rawBody: string },
    config: WebhookAuthConfig,
): WebhookAuthResult {
    const hmacScheme = config.hmac;
    const hmacValue = hmacScheme ? input.headers.get(hmacScheme.header) : null;
    const headerValue =
        config.secretHeaders.map(h => input.headers.get(h)).find(v => v !== null && v !== "") ?? null;
    const tokenValue = new URL(input.url).searchParams.get(WEBHOOK_TOKEN_PARAM) || null;

    const presence: WebhookAuthPresence = {
        has_hmac: hmacValue !== null && hmacValue !== "",
        has_header: headerValue !== null,
        has_token: tokenValue !== null,
    };

    const checks: Array<{ method: WebhookCredential; ok: boolean }> = [];
    if (presence.has_hmac && hmacScheme?.secret && hmacValue) {
        checks.push({
            method: "hmac",
            ok: verifyHmac({ ...hmacScheme, secret: hmacScheme.secret }, hmacValue, input.rawBody),
        });
    }
    if (config.sharedSecret) {
        if (headerValue !== null) {
            checks.push({ method: "header", ok: constantTimeEqual(headerValue, config.sharedSecret) });
        }
        if (tokenValue !== null) {
            checks.push({ method: "token", ok: constantTimeEqual(tokenValue, config.sharedSecret) });
        }
    }

    // Any wrong credential condemns the request, even beside a right one: a
    // legitimate sender never presents a bad secret.
    const failed = checks.find(c => !c.ok);
    if (failed) return { status: "invalid", method: failed.method, ...presence };

    const passed = checks[0];
    if (passed) return { status: "authenticated", method: passed.method, ...presence };

    const anySecretConfigured = Boolean(config.sharedSecret) || Boolean(hmacScheme?.secret);
    return { status: anySecretConfigured ? "missing" : "unconfigured", ...presence };
}

/**
 * Resolve the mode for one provider: a provider-specific override wins over the
 * global flag, and with neither set the default is `monitor`. The values are
 * validated as an enum in env.ts, so a typo fails the build rather than
 * silently meaning "monitor".
 */
export function resolveWebhookAuthMode(
    providerMode: WebhookAuthMode | undefined,
    globalMode: WebhookAuthMode | undefined,
): WebhookAuthMode {
    return providerMode ?? globalMode ?? "monitor";
}

function clientIp(headers: Headers): string | null {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return headers.get("x-real-ip");
}

/**
 * Apply the mode to a verification result and log the outcome.
 *
 * Returns a 401 response to send back, or null when the request may proceed.
 * Every outcome is logged as one JSON line (`event: "webhook_auth"`): info for
 * authenticated, warn for accepted-unauthenticated, error for rejected. Those
 * lines are what the owner reads in the Vercel logs before flipping to
 * enforce. Credential values are never logged.
 */
export function enforceWebhookAuth(
    route: string,
    request: { headers: Headers },
    result: WebhookAuthResult,
    mode: WebhookAuthMode,
): NextResponse | null {
    const rejected =
        result.status === "invalid" || (result.status !== "authenticated" && mode === "enforce");
    const line = JSON.stringify({
        event: "webhook_auth",
        route,
        mode,
        outcome: result.status,
        action: result.status === "authenticated"
            ? "accepted"
            : rejected ? "rejected" : "accepted_unauthenticated",
        ...(result.status === "authenticated" || result.status === "invalid" ? { method: result.method } : {}),
        ip: clientIp(request.headers),
        has_hmac: result.has_hmac,
        has_header: result.has_header,
        has_token: result.has_token,
    });

    if (result.status === "authenticated") {
        console.info(line);
        return null;
    }
    if (rejected) {
        console.error(line);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.warn(line);
    return null;
}
