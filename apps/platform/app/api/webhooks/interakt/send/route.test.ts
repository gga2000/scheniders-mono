import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
    canEdit: true as boolean,
    order: null as Record<string, unknown> | null,
    orderFilters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: vi.fn(async () => ({ user: { id: "u1", email: "a@b.c" }, error: null })),
    createSupabaseServiceClient: () => ({
        from: () => ({ insert: async () => ({}), update: () => ({ eq: async () => ({}) }), select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    }),
    createSupabaseServerClientWithToken: () => ({
        rpc: async () => ({ data: state.canEdit, error: null }),
        from: (table: string) => {
            const chain = {
                select: () => chain,
                eq: (col: string, val: unknown) => {
                    if (table === "orders") state.orderFilters.push([col, val]);
                    return chain;
                },
                maybeSingle: async () => ({ data: table === "orders" ? state.order : null, error: null }),
            };
            return chain;
        },
    }),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({
    resolveActiveTenant: vi.fn(async () => ({ ok: true, tenantId: "t1", role: "employee", platformAdmin: false })),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 })),
    rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/interakt", () => ({
    sendTemplateMessage: vi.fn(async () => ({ success: true, messageId: "m1" })),
    TEMPLATE_NAMES: { confirmation: "c", reminder: "r", discount: "d" },
}));
vi.mock("@/lib/whatsapp-error-handler", () => ({
    flagOrderForWhatsAppFailure: vi.fn(),
    clearWhatsAppFailureFlags: vi.fn(),
}));
vi.mock("@/lib/follow-up-schedule", () => ({ scheduleReminderAfterConfirmation: vi.fn() }));

import { POST } from "./route";
import { sendTemplateMessage } from "@/lib/interakt";
import { consumeRateLimit } from "@/lib/rate-limit";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function req(body: unknown, auth = "Bearer tok"): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.Authorization = auth;
    return new Request("http://x/api/webhooks/interakt/send", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    state.canEdit = true;
    state.order = { id: ORDER_ID, order_id: "1001", tenant_id: "t1", phone: "07700000000", status: "new" };
    state.orderFilters = [];
});

describe("POST /api/webhooks/interakt/send", () => {
    it("401s without a token and sends nothing", async () => {
        const res = await POST(req({ order: { id: ORDER_ID } }, "") as never);
        expect(res.status).toBe(401);
        expect(sendTemplateMessage).not.toHaveBeenCalled();
    });

    it("403s a viewer (no orders.edit) and sends nothing", async () => {
        state.canEdit = false;
        const res = await POST(req({ order: { id: ORDER_ID } }) as never);
        expect(res.status).toBe(403);
        expect(sendTemplateMessage).not.toHaveBeenCalled();
    });

    it("refuses an out-of-range discount", async () => {
        const res = await POST(req({ order: { id: ORDER_ID }, templateType: "discount", discountPercent: 500 }) as never);
        expect(res.status).toBe(400);
        expect(sendTemplateMessage).not.toHaveBeenCalled();
    });

    it("meters per store and reads the order only inside the caller's store", async () => {
        const res = await POST(req({ order: { id: ORDER_ID } }) as never);
        expect(res.status).toBe(200);
        expect(consumeRateLimit).toHaveBeenCalledWith("wa-manual-send:t1", 120, 3600);
        expect(state.orderFilters).toContainEqual(["tenant_id", "t1"]);
    });

    it("refuses (503) when the meter is down", async () => {
        vi.mocked(consumeRateLimit).mockResolvedValueOnce({
            allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0, error: "db down",
        } as never);
        const res = await POST(req({ order: { id: ORDER_ID } }) as never);
        expect(res.status).toBe(503);
        expect(sendTemplateMessage).not.toHaveBeenCalled();
    });
});
