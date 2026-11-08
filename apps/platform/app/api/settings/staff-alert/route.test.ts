import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireRequestCaller: vi.fn(),
    upsert: vi.fn(),
}));

vi.mock("@/lib/auth/require-request-caller", () => ({ requireRequestCaller: mocks.requireRequestCaller }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => {
            const q = {
                select: () => q,
                eq: () => q,
                maybeSingle: async () => ({ data: { value: { enabled: true, numbers: [] } }, error: null }),
                upsert: (...args: unknown[]) => (mocks.upsert(...args), Promise.resolve({ error: null })),
            };
            return q;
        },
    }),
}));

import { GET, POST, PUT, DELETE } from "./route";

const req = (method: string, body?: unknown, query = "") =>
    new NextRequest(`http://x/api/settings/staff-alert${query}`, {
        method,
        headers: { Authorization: "Bearer t" },
        body: body ? JSON.stringify(body) : undefined,
    });

const denied = () => ({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
const admin = { ok: true, userId: "u1", tenantId: "t1", role: "admin", platformAdmin: false };

beforeEach(() => vi.clearAllMocks());

describe("staff alert settings", () => {
    it("lets any member read but asks for a store admin to change anything", async () => {
        mocks.requireRequestCaller.mockResolvedValue(admin);
        await GET(req("GET"));
        expect(mocks.requireRequestCaller).toHaveBeenLastCalledWith(expect.anything(), "member");
        for (const call of [
            () => POST(req("POST", { phone: "07701234567" })),
            () => PUT(req("PUT", { enabled: false })),
            () => DELETE(req("DELETE", undefined, "?phone=07701234567")),
        ]) {
            await call();
            expect(mocks.requireRequestCaller).toHaveBeenLastCalledWith(expect.anything(), "tenant-admin");
        }
    });

    it("a viewer or employee cannot add their own number", async () => {
        mocks.requireRequestCaller.mockResolvedValue(denied());
        const res = await POST(req("POST", { phone: "07701234567" }));
        expect(res.status).toBe(403);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });
});
