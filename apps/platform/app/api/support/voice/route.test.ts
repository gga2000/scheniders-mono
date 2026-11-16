import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { RequestCaller } from "@/lib/auth/require-request-caller";

type Call = { method: string; args: unknown[] };

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    calls: [] as Call[],
    listed: [] as { name: string; created_at: string }[],
    uploadError: null as { message: string } | null,
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => {
        if (!state.caller) throw new Error("test did not set a caller");
        return state.caller;
    },
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        storage: {
            from: (bucket: string) => {
                state.calls.push({ method: "from", args: [bucket] });
                return {
                    list: async (...args: unknown[]) => {
                        state.calls.push({ method: "list", args });
                        return { data: state.listed, error: null };
                    },
                    upload: async (...args: unknown[]) => {
                        state.calls.push({ method: "upload", args });
                        return { data: state.uploadError ? null : { path: args[0] }, error: state.uploadError };
                    },
                };
            },
        },
    }),
}));

import { POST } from "./route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const member: RequestCaller = { ok: true, userId: "u", email: "a@b.c", tenantId: TENANT, role: "admin", platformAdmin: false, readOnly: false };
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0]);

const request = (bytes: Uint8Array<ArrayBuffer>) =>
    new NextRequest("http://x/api/support/voice", {
        method: "POST",
        headers: { "Content-Type": "audio/webm", Authorization: "Bearer t" },
        body: bytes,
    });

beforeEach(() => {
    state.caller = member;
    state.calls.length = 0;
    state.listed = [];
    state.uploadError = null;
});

describe("POST /api/support/voice", () => {
    it("answers a signed-out caller with the guard's response and stores nothing", async () => {
        state.caller = { ok: false, response: NextResponse.json({ success: false }, { status: 401 }) };
        expect((await POST(request(WEBM))).status).toBe(401);
        expect(state.calls).toHaveLength(0);
    });

    it("refuses something that is not a recording", async () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect((await POST(request(jpeg))).status).toBe(400);
        expect((await POST(request(new Uint8Array()))).status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it("refuses a voice note over the bucket's limit", async () => {
        const big = new Uint8Array(2_097_153);
        big.set([0x1a, 0x45, 0xdf, 0xa3]);
        const res = await POST(request(big));
        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ success: false, error: "support_voice_too_big" });
        expect(state.calls).toHaveLength(0);
    });

    it("stores the voice note in the session shop's own folder of the private bucket", async () => {
        const res = await POST(request(WEBM));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.path).toMatch(new RegExp(`^${TENANT}/[0-9a-f-]{36}\\.webm$`));
        expect(new Set(state.calls.filter((c) => c.method === "from").map((c) => c.args[0]))).toEqual(new Set(["support-voice"]));
        expect(state.calls.find((c) => c.method === "list")?.args[0]).toBe(TENANT);
        const upload = state.calls.find((c) => c.method === "upload");
        expect(upload?.args[0]).toBe(body.data.path);
        expect(upload?.args[2]).toEqual({ contentType: "audio/webm", upsert: false });
    });

    it("names an iPhone recording by what it is, not by its label", async () => {
        const res = await POST(request(MP4));
        expect((await res.json()).data.path).toMatch(/\.m4a$/);
        expect(state.calls.find((c) => c.method === "upload")?.args[2]).toEqual({ contentType: "audio/mp4", upsert: false });
    });

    it("refuses an 11th voice note from one shop within 10 minutes, but not older ones", async () => {
        const now = Date.now();
        state.listed = Array.from({ length: 10 }, (_, i) => ({ name: `${i}.jpg`, created_at: new Date(now - i * 30_000).toISOString() }));
        expect((await POST(request(WEBM))).status).toBe(429);
        expect(state.calls.some((c) => c.method === "upload")).toBe(false);

        state.calls.length = 0;
        state.listed = Array.from({ length: 10 }, (_, i) => ({ name: `${i}.jpg`, created_at: new Date(now - 11 * 60_000 - i).toISOString() }));
        expect((await POST(request(WEBM))).status).toBe(200);
    });

    it("lets a storage failure reach the failure report instead of answering success", async () => {
        state.uploadError = { message: "bucket full" };
        await expect(POST(request(WEBM))).rejects.toThrow("Support voice upload failed: bucket full");
    });
});
