import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    createSupabaseServerClientWithToken: vi.fn(() => ({ rpc })),
}));
vi.mock("@/lib/auth/require-request-caller", () => ({ requireRequestCaller: vi.fn() }));
vi.mock("@/lib/prime/client", () => ({ getPrimeClient: vi.fn() }));
vi.mock("@/lib/prime/connection", () => ({ loadPrimeMerchant: vi.fn() }));
vi.mock("@/lib/prime/pull-back", () => ({ pullBackPrimeShipment: vi.fn() }));

import { POST } from "./route";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient } from "@/lib/prime/client";
import { pullBackPrimeShipment } from "@/lib/prime/pull-back";

const TENANT = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";

function request() {
    return new NextRequest("http://localhost/api/prime/pull-back", {
        method: "POST",
        headers: { authorization: "Bearer tok", "content-type": "application/json" },
        body: JSON.stringify({ orderId: ORDER }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRequestCaller).mockResolvedValue({
        ok: true, userId: "u1", tenantId: TENANT, role: "employee", platformAdmin: false,
    });
});

describe("POST /api/prime/pull-back", () => {
    it("refuses an employee whose orders.edit was switched off, before Prime is touched", async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        const res = await POST(request());
        expect(res.status).toBe(403);
        expect(rpc).toHaveBeenCalledWith("has_tenant_permission", { p_tenant_id: TENANT, p_permission: "orders.edit" });
        expect(getPrimeClient).not.toHaveBeenCalled();
        expect(pullBackPrimeShipment).not.toHaveBeenCalled();
    });
});
