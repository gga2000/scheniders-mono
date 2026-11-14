import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));

import { authedFetch, SignedOutError } from "./authed-fetch";

const session = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const bearer = (call: unknown[]) => new Headers((call[1] as RequestInit).headers).get("Authorization");

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

describe("authedFetch", () => {
    it("signs the call with the session read at call time, replacing any stale header", async () => {
        auth.getSession.mockResolvedValue(session("fresh"));
        fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
        await authedFetch("/api/x", { headers: { Authorization: "Bearer stale", "Content-Type": "application/json" } });
        expect(bearer(fetchMock.mock.calls[0])).toBe("Bearer fresh");
        expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Content-Type")).toBe("application/json");
    });

    it("on a 401 refreshes once and retries once with the new token", async () => {
        auth.getSession.mockResolvedValue(session("expired"));
        auth.refreshSession.mockResolvedValue(session("renewed"));
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 401 }))
            .mockResolvedValueOnce(new Response("{}", { status: 200 }));
        const res = await authedFetch("/api/x");
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(bearer(fetchMock.mock.calls[1])).toBe("Bearer renewed");
    });

    it("returns the 401 when the refresh fails, without looping", async () => {
        auth.getSession.mockResolvedValue(session("expired"));
        auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("revoked") });
        fetchMock.mockResolvedValue(new Response("", { status: 401 }));
        expect((await authedFetch("/api/x")).status).toBe(401);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws SignedOutError with no session instead of sending an empty token", async () => {
        auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        await expect(authedFetch("/api/x")).rejects.toBeInstanceOf(SignedOutError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
