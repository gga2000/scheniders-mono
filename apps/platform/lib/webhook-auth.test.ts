import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    constantTimeEqual,
    enforceWebhookAuth,
    resolveWebhookAuthMode,
    verifyWebhookAuth,
    type WebhookAuthConfig,
} from "./webhook-auth";

const SECRET = "s3cret-token";
const BASE = "https://app.example.com/api/webhooks/x";

function req(opts: { headers?: Record<string, string>; query?: string; body?: string } = {}) {
    return {
        headers: new Headers(opts.headers ?? {}),
        url: opts.query ? `${BASE}?${opts.query}` : BASE,
        rawBody: opts.body ?? `{"a":1}`,
    };
}

const interakt = (secret: string | undefined): WebhookAuthConfig => ({
    sharedSecret: secret,
    secretHeaders: ["x-webhook-secret", "x-interakt-secret"],
    hmac: { header: "interakt-signature", secret, encoding: "hex", prefix: "sha256=", acceptReserializedBody: true },
});

const lightfunnels = (shared: string | undefined, appSecret: string | undefined): WebhookAuthConfig => ({
    sharedSecret: shared,
    secretHeaders: ["x-webhook-secret"],
    hmac: { header: "lightfunnels-hmac", secret: appSecret, encoding: "base64", acceptReserializedBody: true },
});

describe("constantTimeEqual", () => {
    it("matches equal strings and rejects different ones of any length", () => {
        expect(constantTimeEqual("abc", "abc")).toBe(true);
        expect(constantTimeEqual("abc", "abd")).toBe(false);
        expect(constantTimeEqual("abc", "abcd")).toBe(false);
        expect(constantTimeEqual("", "x")).toBe(false);
    });
});

describe("verifyWebhookAuth — shared secret", () => {
    const config: WebhookAuthConfig = { sharedSecret: SECRET, secretHeaders: ["x-webhook-secret"] };

    it("accepts the secret in the header", () => {
        const r = verifyWebhookAuth(req({ headers: { "x-webhook-secret": SECRET } }), config);
        expect(r).toMatchObject({ status: "authenticated", method: "header", has_header: true, has_token: false });
    });

    it("accepts the secret as ?token=", () => {
        const r = verifyWebhookAuth(req({ query: `token=${encodeURIComponent(SECRET)}` }), config);
        expect(r).toMatchObject({ status: "authenticated", method: "token", has_token: true, has_header: false });
    });

    it("rejects a wrong header", () => {
        const r = verifyWebhookAuth(req({ headers: { "x-webhook-secret": "nope" } }), config);
        expect(r).toMatchObject({ status: "invalid", method: "header" });
    });

    it("rejects a wrong token", () => {
        const r = verifyWebhookAuth(req({ query: "token=nope" }), config);
        expect(r).toMatchObject({ status: "invalid", method: "token" });
    });

    it("rejects when one credential is right and another wrong", () => {
        const r = verifyWebhookAuth(
            req({ headers: { "x-webhook-secret": SECRET }, query: "token=nope" }),
            config,
        );
        expect(r).toMatchObject({ status: "invalid", method: "token" });
    });

    it("reports missing when a secret is configured but nothing is presented", () => {
        expect(verifyWebhookAuth(req(), config)).toMatchObject({
            status: "missing", has_hmac: false, has_header: false, has_token: false,
        });
    });

    it("treats an empty ?token= as absent", () => {
        expect(verifyWebhookAuth(req({ query: "token=" }), config)).toMatchObject({ status: "missing", has_token: false });
    });

    it("reports unconfigured when no secret exists, even if credentials are presented", () => {
        const r = verifyWebhookAuth(
            req({ headers: { "x-webhook-secret": "anything" }, query: "token=x" }),
            { sharedSecret: undefined, secretHeaders: ["x-webhook-secret"] },
        );
        expect(r).toMatchObject({ status: "unconfigured", has_header: true, has_token: true });
    });

    it("checks every configured header name", () => {
        const r = verifyWebhookAuth(req({ headers: { "x-interakt-secret": SECRET } }), interakt(SECRET));
        expect(r).toMatchObject({ status: "authenticated", method: "header" });
    });
});

describe("verifyWebhookAuth — Interakt-Signature HMAC", () => {
    it("verifies Interakt's published test vector", () => {
        // https://www.interakt.shop/resource-center/interakts-webhooks/
        const r = verifyWebhookAuth(
            req({
                body: `{"foo":1,"bar":2}`,
                headers: { "Interakt-Signature": "sha256=b84783d10ede5bd6ed771e8b16fbe5a7093340159d6e49ec4248350b6ec2c7b4" },
            }),
            interakt("examplekey"),
        );
        expect(r).toMatchObject({ status: "authenticated", method: "hmac", has_hmac: true });
    });

    it("accepts upper-case hex", () => {
        const body = `{"type":"message_received"}`;
        const sig = createHmac("sha256", SECRET).update(body).digest("hex").toUpperCase();
        const r = verifyWebhookAuth(req({ body, headers: { "interakt-signature": `sha256=${sig}` } }), interakt(SECRET));
        expect(r).toMatchObject({ status: "authenticated", method: "hmac" });
    });

    it("rejects a signature over a different body", () => {
        const sig = createHmac("sha256", SECRET).update(`{"x":1}`).digest("hex");
        const r = verifyWebhookAuth(
            req({ body: `{"x":2}`, headers: { "interakt-signature": `sha256=${sig}` } }),
            interakt(SECRET),
        );
        expect(r).toMatchObject({ status: "invalid", method: "hmac" });
    });

    it("rejects a signature with the wrong key", () => {
        const body = `{"x":1}`;
        const sig = createHmac("sha256", "other").update(body).digest("hex");
        const r = verifyWebhookAuth(req({ body, headers: { "interakt-signature": `sha256=${sig}` } }), interakt(SECRET));
        expect(r).toMatchObject({ status: "invalid", method: "hmac" });
    });

    it("rejects a signature without the sha256= prefix", () => {
        const body = `{"x":1}`;
        const sig = createHmac("sha256", SECRET).update(body).digest("hex");
        const r = verifyWebhookAuth(req({ body, headers: { "interakt-signature": sig } }), interakt(SECRET));
        expect(r).toMatchObject({ status: "invalid", method: "hmac" });
    });

    it("ignores a signature header it has no key for", () => {
        const r = verifyWebhookAuth(req({ headers: { "interakt-signature": "sha256=abc" } }), interakt(undefined));
        expect(r).toMatchObject({ status: "unconfigured", has_hmac: true });
    });

    it("refuses a valid token alongside a bad signature", () => {
        const r = verifyWebhookAuth(
            req({ query: `token=${SECRET}`, headers: { "interakt-signature": "sha256=deadbeef" } }),
            interakt(SECRET),
        );
        expect(r).toMatchObject({ status: "invalid", method: "hmac" });
    });
});

describe("verifyWebhookAuth — lightfunnels-hmac", () => {
    const APP = "lf-app-secret";

    it("verifies a base64 signature over the raw body", () => {
        const body = `{"node":{"id":"order_1"}}`;
        const sig = createHmac("sha256", APP).update(body).digest("base64");
        const r = verifyWebhookAuth(req({ body, headers: { "lightfunnels-hmac": sig } }), lightfunnels(undefined, APP));
        expect(r).toMatchObject({ status: "authenticated", method: "hmac" });
    });

    it("verifies a signature over the re-serialised body (LightFunnels' reference signs JSON.stringify(req.body))", () => {
        const wire = `{ "node": { "id": "order_1" } }`;
        const sig = createHmac("sha256", APP).update(JSON.stringify(JSON.parse(wire))).digest("base64");
        const r = verifyWebhookAuth(req({ body: wire, headers: { "lightfunnels-hmac": sig } }), lightfunnels(undefined, APP));
        expect(r).toMatchObject({ status: "authenticated", method: "hmac" });
    });

    it("rejects a forged signature", () => {
        const r = verifyWebhookAuth(
            req({ headers: { "lightfunnels-hmac": "Zm9yZ2Vk" } }),
            lightfunnels(SECRET, APP),
        );
        expect(r).toMatchObject({ status: "invalid", method: "hmac" });
    });

    it("still accepts the shared-secret token when no app secret is configured", () => {
        const r = verifyWebhookAuth(
            req({ query: `token=${SECRET}`, headers: { "lightfunnels-hmac": "unverifiable" } }),
            lightfunnels(SECRET, undefined),
        );
        expect(r).toMatchObject({ status: "authenticated", method: "token", has_hmac: true });
    });

    it("tolerates a non-JSON body (raw-only check)", () => {
        const body = "not json";
        const sig = createHmac("sha256", APP).update(body).digest("base64");
        const r = verifyWebhookAuth(req({ body, headers: { "lightfunnels-hmac": sig } }), lightfunnels(undefined, APP));
        expect(r).toMatchObject({ status: "authenticated", method: "hmac" });
    });
});

describe("resolveWebhookAuthMode", () => {
    it("defaults to monitor", () => {
        expect(resolveWebhookAuthMode(undefined, undefined)).toBe("monitor");
    });
    it("uses the global flag", () => {
        expect(resolveWebhookAuthMode(undefined, "enforce")).toBe("enforce");
    });
    it("lets the provider override win", () => {
        expect(resolveWebhookAuthMode("monitor", "enforce")).toBe("monitor");
        expect(resolveWebhookAuthMode("enforce", "monitor")).toBe("enforce");
    });
});

describe("enforceWebhookAuth", () => {
    afterEach(() => vi.restoreAllMocks());

    const request = { headers: new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) };
    const presence = { has_hmac: false, has_header: false, has_token: false };

    function logged(spy: ReturnType<typeof vi.spyOn>) {
        expect(spy).toHaveBeenCalledTimes(1);
        return JSON.parse(String(spy.mock.calls[0]?.[0]));
    }

    it.each(["monitor", "enforce"] as const)("lets an authenticated request through in %s mode", mode => {
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        const res = enforceWebhookAuth("/r", request, { status: "authenticated", method: "token", ...presence, has_token: true }, mode);
        expect(res).toBeNull();
        expect(logged(info)).toMatchObject({ event: "webhook_auth", outcome: "authenticated", action: "accepted", method: "token" });
    });

    it.each(["monitor", "enforce"] as const)("returns 401 for an invalid credential in %s mode", mode => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const res = enforceWebhookAuth("/r", request, { status: "invalid", method: "header", ...presence, has_header: true }, mode);
        expect(res?.status).toBe(401);
        expect(logged(error)).toMatchObject({ outcome: "invalid", action: "rejected", method: "header" });
    });

    it.each(["missing", "unconfigured"] as const)("monitor mode processes a %s request and warns loudly", status => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const res = enforceWebhookAuth("/api/webhooks/lightfunnels", request, { status, ...presence }, "monitor");
        expect(res).toBeNull();
        expect(logged(warn)).toEqual({
            event: "webhook_auth",
            route: "/api/webhooks/lightfunnels",
            mode: "monitor",
            outcome: status,
            action: "accepted_unauthenticated",
            ip: "203.0.113.7",
            has_hmac: false,
            has_header: false,
            has_token: false,
        });
    });

    it.each(["missing", "unconfigured"] as const)("enforce mode returns 401 for a %s request", status => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const res = enforceWebhookAuth("/r", request, { status, ...presence }, "enforce");
        expect(res?.status).toBe(401);
        expect(logged(error)).toMatchObject({ outcome: status, action: "rejected" });
    });

    it("never logs a credential value", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const r = verifyWebhookAuth(
            { headers: new Headers({ "x-webhook-secret": "leaky-value" }), url: `${BASE}?token=leaky-token`, rawBody: "{}" },
            { sharedSecret: undefined, secretHeaders: ["x-webhook-secret"] },
        );
        enforceWebhookAuth("/r", request, r, "monitor");
        const line = String(warn.mock.calls[0]?.[0]);
        expect(line).not.toContain("leaky");
    });
});
