import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { RequestCaller } from "@/lib/auth/require-request-caller";

type DbResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    requirements: [] as string[],
    calls: [] as { method: string; args: unknown[] }[],
    result: { data: null, error: null } as DbResult,
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async (_req: Request, requirement: string) => {
        state.requirements.push(requirement);
        if (!state.caller) throw new Error("test did not set a caller");
        return state.caller;
    },
}));

function fakeQuery(): unknown {
    return new Proxy(() => undefined, {
        get(_target, prop) {
            if (prop === "then") return (resolve: (value: DbResult) => void) => resolve(state.result);
            return (...args: unknown[]) => {
                state.calls.push({ method: String(prop), args });
                return fakeQuery();
            };
        },
    });
}

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => fakeQuery() }));

import { GET } from "./route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const admin: RequestCaller = { ok: true, userId: "u", email: "owner@shop.test", tenantId: TENANT, role: "admin", platformAdmin: false, readOnly: false };
const request = (url = "http://x/api/support/visits") => new NextRequest(url, { headers: { Authorization: "Bearer t" } });

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.caller = admin;
    state.requirements.length = 0;
    state.calls.length = 0;
    state.result = { data: null, error: null };
});

describe("GET /api/support/visits", () => {
    it("is for shop admins only, and reads nothing for a refused caller", async () => {
        state.caller = { ok: false, response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
        const res = await GET(request());
        expect(res.status).toBe(403);
        expect(state.requirements).toEqual(["tenant-admin"]);
        expect(state.calls).toHaveLength(0);
    });

    it("reads the caller's own shop, whatever the address names", async () => {
        const visits = [{ action: "extend_trial", staff: "Noor", at: "2026-11-16T10:00:00+00:00" }];
        state.result = { data: visits, error: null };
        const res = await GET(request(`http://x/api/support/visits?tenant_id=99999999-9999-4999-8999-999999999999`));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: visits });
        expect(state.calls).toEqual([{ method: "rpc", args: ["support_staff_visits", { p_tenant_id: TENANT }] }]);
    });

    it("fails loudly on a step it does not know rather than showing a wrong line", async () => {
        state.result = { data: [{ action: "update_tags", staff: null, at: "2026-11-16T10:00:00Z" }], error: null };
        await expect(GET(request())).rejects.toThrow();
    });
});
