import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
    claims: null as null | { sub: string; app_metadata?: Record<string, unknown> },
    readBoot: vi.fn(),
    captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: H.captureException, captureMessage: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServerClient: async () => ({
        auth: { getClaims: async () => ({ data: H.claims ? { claims: H.claims } : null, error: null }) },
    }),
}));
vi.mock("@/lib/boot/read", () => ({ readBoot: H.readBoot }));

import { GET } from "./route";

const get = (query: string) => GET(new NextRequest(`https://app.example/api/boot?${query}`));

beforeEach(() => {
    H.claims = { sub: "u-1", app_metadata: {} };
    H.readBoot.mockReset();
    H.captureException.mockReset();
});

describe("GET /api/boot", () => {
    it("answers the signed-in user's first-load read, kept by no cache", async () => {
        H.readBoot.mockResolvedValue({ v: 1, serverNow: 1, session: null, queries: null });
        const res = await get("path=%2Fdashboard&range=7d");
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(H.readBoot).toHaveBeenCalledWith(expect.anything(), { userId: "u-1", supportViewer: false }, { path: "/dashboard", range: "7d" }, Date.now);
    });

    it("passes a support viewer on only when the token says so", async () => {
        H.claims = { sub: "u-2", app_metadata: { support_viewer: true } };
        H.readBoot.mockResolvedValue({ v: 1, serverNow: 1, session: null, queries: null });
        await get("path=%2Forders");
        expect(H.readBoot.mock.calls[0][1]).toEqual({ userId: "u-2", supportViewer: true });
    });

    it("refuses a request with no session", async () => {
        H.claims = null;
        const res = await get("path=%2Fdashboard");
        expect(res.status).toBe(401);
        expect(H.readBoot).not.toHaveBeenCalled();
    });

    it("refuses a request that names no page", async () => {
        expect((await get("range=7d")).status).toBe(400);
        expect((await get("path=dashboard")).status).toBe(400);
    });

    it("reports a failed read and fails the request, so the app reads for itself", async () => {
        H.readBoot.mockRejectedValue(new Error("profile read failed: timeout"));
        await expect(get("path=%2Fdashboard")).rejects.toThrow("profile read failed");
        expect(H.captureException).toHaveBeenCalledTimes(1);
    });
});
