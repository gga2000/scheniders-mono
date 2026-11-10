import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted((): { TURNSTILE_SECRET_KEY?: string } => ({}));
vi.mock("@/lib/env", () => ({ env: envState }));

import { verifyTurnstile } from "./turnstile";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("verifyTurnstile", () => {
    beforeEach(() => {
        envState.TURNSTILE_SECRET_KEY = "secret-x";
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("skips when no secret is configured", async () => {
        envState.TURNSTILE_SECRET_KEY = undefined;
        expect(await verifyTurnstile(undefined, null)).toEqual({ ok: true, skipped: true });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a missing token without calling Cloudflare", async () => {
        expect(await verifyTurnstile(undefined, "1.2.3.4")).toEqual({ ok: false, reason: "missing" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends secret, token and IP, and passes a good token", async () => {
        fetchMock.mockResolvedValue(reply({ success: true }));
        expect(await verifyTurnstile("tok", "1.2.3.4")).toEqual({ ok: true, skipped: false });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
        const form = init.body as URLSearchParams;
        expect(form.get("secret")).toBe("secret-x");
        expect(form.get("response")).toBe("tok");
        expect(form.get("remoteip")).toBe("1.2.3.4");
    });

    it("rejects a spent or fake token", async () => {
        fetchMock.mockResolvedValue(reply({ success: false, "error-codes": ["timeout-or-duplicate"] }));
        expect(await verifyTurnstile("tok", null)).toEqual({
            ok: false,
            reason: "rejected",
            codes: ["timeout-or-duplicate"],
        });
    });

    it("reports unavailable on network errors, bad status or odd replies", async () => {
        fetchMock.mockRejectedValueOnce(new Error("down"));
        expect(await verifyTurnstile("tok", null)).toMatchObject({ reason: "unavailable" });
        fetchMock.mockResolvedValueOnce(reply({}, 500));
        expect(await verifyTurnstile("tok", null)).toMatchObject({ reason: "unavailable" });
        fetchMock.mockResolvedValueOnce(reply({ nope: 1 }));
        expect(await verifyTurnstile("tok", null)).toMatchObject({ reason: "unavailable" });
    });
});
