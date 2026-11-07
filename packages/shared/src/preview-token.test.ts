import { describe, it, expect, vi, afterEach } from "vitest";
import { resolvePreviewTokenSecret, signPreviewToken, verifyPreviewToken } from "./preview-token";

const SECRET = "test-preview-secret-do-not-use-in-prod";
const TENANT = "tenant_abc123";

afterEach(() => {
    vi.useRealTimers();
});

describe("preview-token", () => {
    it("round-trips a valid token", () => {
        const token = signPreviewToken({ tenant_id: TENANT }, SECRET, 3600);
        const result = verifyPreviewToken(token, SECRET);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.payload.tenant_id).toBe(TENANT);
            expect(result.payload.exp).toBeGreaterThan(result.payload.iat);
            expect(result.payload.exp - result.payload.iat).toBe(3600);
        }
    });

    it("rejects a tampered payload", () => {
        const token = signPreviewToken({ tenant_id: TENANT }, SECRET, 3600);
        const [payload, sig] = token.split(".");
        // Re-encode a payload with a different tenant_id but keep original sig.
        const evil = Buffer.from(
            JSON.stringify({
                tenant_id: "tenant_evil",
                iat: 0,
                exp: 9999999999,
            }),
            "utf8",
        )
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
        const tampered = `${evil}.${sig}`;
        const result = verifyPreviewToken(tampered, SECRET);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("bad_signature");
        // Sanity: original still validates.
        expect(verifyPreviewToken(`${payload}.${sig}`, SECRET).ok).toBe(true);
    });

    it("rejects an expired token", () => {
        const start = new Date("2026-05-16T12:00:00.000Z");
        vi.useFakeTimers();
        vi.setSystemTime(start);
        const token = signPreviewToken({ tenant_id: TENANT }, SECRET, 60);
        // Advance past expiry.
        vi.setSystemTime(new Date(start.getTime() + 61_000));
        const result = verifyPreviewToken(token, SECRET);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("expired");
    });

    it("rejects a token signed with a different secret", () => {
        const token = signPreviewToken({ tenant_id: TENANT }, SECRET, 3600);
        const result = verifyPreviewToken(token, "some-other-secret");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("bad_signature");
    });

    it("rejects malformed input", () => {
        expect(verifyPreviewToken("", SECRET).ok).toBe(false);
        expect(verifyPreviewToken("no-dot-here", SECRET).ok).toBe(false);
        expect(verifyPreviewToken(".only-sig", SECRET).ok).toBe(false);
        expect(verifyPreviewToken("only-payload.", SECRET).ok).toBe(false);
    });
});

describe("resolvePreviewTokenSecret", () => {
    it("prefers an explicit PREVIEW_TOKEN_SECRET", () => {
        expect(
            resolvePreviewTokenSecret({ PREVIEW_TOKEN_SECRET: "x", SUPABASE_SERVICE_ROLE_KEY: "k" }),
        ).toBe("x");
    });

    it("derives the same key on both apps from the shared server key", () => {
        const a = resolvePreviewTokenSecret({ SUPABASE_SERVICE_ROLE_KEY: "k" });
        const b = resolvePreviewTokenSecret({ SUPABASE_SERVICE_ROLE_KEY: "k" });
        expect(a).toBe(b);
        expect(a).not.toBe("k");
        const token = signPreviewToken({ tenant_id: "t1" }, a as string, 60);
        expect(verifyPreviewToken(token, b as string).ok).toBe(true);
    });

    it("a different server key cannot verify the token", () => {
        const a = resolvePreviewTokenSecret({ SUPABASE_SERVICE_ROLE_KEY: "k" }) as string;
        const c = resolvePreviewTokenSecret({ SUPABASE_SERVICE_ROLE_KEY: "other" }) as string;
        const token = signPreviewToken({ tenant_id: "t1" }, a, 60);
        expect(verifyPreviewToken(token, c).ok).toBe(false);
    });

    it("returns null with no key at all, so callers fail closed", () => {
        expect(resolvePreviewTokenSecret({})).toBeNull();
    });
});
