// Prime's status webhook: only Prime's secret gets in, the call only names
// cases (they are read back from Prime), the reason Prime gives is kept, and
// cases of stores whose link is off are left alone.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { primeWebhookSecret } from "@/lib/prime/webhook";

const config = { baseUrl: "https://prime-iq.com/myp/webapi", systemCode: "SYSTEM_A", password: "pw-one", initialToken: "t" };

const state = vi.hoisted(() => ({
    configured: true,
    shipments: [] as { id: string; tenant_id: string; case_id: number }[],
    activeTenants: [] as string[],
    updates: [] as { table: string; payload: Record<string, unknown>; id: unknown }[],
    sync: vi.fn(),
    stepNames: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/prime/client", () => ({
    primeConfigFromEnv: () => (state.configured ? config : null),
    getPrimeClient: () => (state.configured ? { stepNames: state.stepNames } : null),
}));

vi.mock("@/lib/prime/sync", () => ({ syncPrimeCases: state.sync }));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => ({
            select: () => ({
                in: async (_col: string, values: unknown[]) =>
                    table === "prime_shipments"
                        ? { data: state.shipments.filter((s) => values.includes(s.case_id)), error: null }
                        : { data: null, error: { message: `unexpected ${table}` } },
                eq: () => ({
                    in: async (_col: string, values: unknown[]) => ({
                        data: state.activeTenants.filter((t) => values.includes(t)).map((tenant_id) => ({ tenant_id })),
                        error: null,
                    }),
                }),
            }),
            update: (payload: Record<string, unknown>) => ({
                eq: async (_col: string, id: unknown) => {
                    state.updates.push({ table, payload, id });
                    return { error: null };
                },
            }),
        }),
    }),
}));

import { POST } from "./route";

const call = (body: unknown, secret: string | null = primeWebhookSecret(config)) =>
    POST(
        new NextRequest("https://schenidersapp.xyz/api/prime/webhook?v=abc", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "X-Prime-Key": secret }) },
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );

describe("POST /api/prime/webhook", () => {
    beforeEach(() => {
        state.configured = true;
        state.shipments = [{ id: "ps1", tenant_id: "t1", case_id: 52176640 }];
        state.activeTenants = ["t1"];
        state.updates = [];
        state.sync.mockReset().mockResolvedValue({ checked: 1, delivered: 1, flagged: 0, conflicts: 0 });
        state.stepNames.mockReset().mockResolvedValue(new Map([["DLEIVERD", "شحنات سلمت بنجاح"]]));
    });

    it("refuses a call without Prime's secret, and reads nothing", async () => {
        expect((await call({ caseId: 52176640 }, null)).status).toBe(401);
        expect((await call({ caseId: 52176640 }, "guess")).status).toBe(401);
        expect(state.sync).not.toHaveBeenCalled();
    });

    it("answers 503 while Prime is not configured", async () => {
        state.configured = false;
        expect((await call({ caseId: 52176640 })).status).toBe(503);
    });

    it("refuses a body that is not Prime's", async () => {
        expect((await call("not json")).status).toBe(400);
        expect((await call({ status: "DELIVERED" })).status).toBe(400);
    });

    it("reads the named case back from Prime for its store", async () => {
        const res = await call({ caseId: 52176640, shipmentStatus: "DELIVERED" });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, matched: 1, delivered: 1, flagged: 0 });
        expect(state.sync).toHaveBeenCalledWith(expect.anything(), expect.anything(), "t1", [52176640], new Map([["DLEIVERD", "شحنات سلمت بنجاح"]]));
        expect(state.updates).toEqual([]);
    });

    it("keeps the reason Prime gives for a parcel coming back", async () => {
        await call({ caseId: 52176640, shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", returnReason: "الزبون رفض الاستلام" });
        expect(state.updates).toEqual([{ table: "prime_shipments", payload: { return_reason: "الزبون رفض الاستلام" }, id: "ps1" }]);
    });

    it("acknowledges a case we do not track, without reading Prime", async () => {
        const res = await call({ caseId: 99999999 });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, matched: 0 });
        expect(state.sync).not.toHaveBeenCalled();
    });

    it("leaves a store whose link is off alone, reasons included", async () => {
        state.activeTenants = [];
        const res = await call({ caseId: 52176640, returnReason: "رفض" });
        expect(await res.json()).toEqual({ success: true, matched: 0, delivered: 0, flagged: 0 });
        expect(state.sync).not.toHaveBeenCalled();
        expect(state.updates).toEqual([]);
    });

    it("still applies the status when the step names cannot be read", async () => {
        state.stepNames.mockRejectedValue(new Error("Prime is down"));
        expect((await call({ caseId: 52176640 })).status).toBe(200);
        expect(state.sync).toHaveBeenCalledWith(expect.anything(), expect.anything(), "t1", [52176640], new Map());
    });

    it("answers 500 when the read fails, so Prime calls again", async () => {
        state.sync.mockRejectedValue(new Error("Prime is down"));
        expect((await call({ caseId: 52176640 })).status).toBe(500);
    });
});
