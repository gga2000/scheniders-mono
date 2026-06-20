import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/abandoned-cart-sender", () => ({
    sendCartRecoveryMessage: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendCartRecoveryMessage } from "@/lib/abandoned-cart-sender";

function makeClient(carts: unknown[], tenants: unknown[]) {
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const cartsChain: Record<string, unknown> = {};
    cartsChain.is = () => cartsChain;
    cartsChain.lte = () => cartsChain;
    cartsChain.order = () => cartsChain;
    cartsChain.limit = () => Promise.resolve({ data: carts, error: null });
    const tenantsChain = {
        in: () => Promise.resolve({ data: tenants, error: null }),
    };
    const client = {
        from: (table: string) =>
            table === "tenants"
                ? { select: () => tenantsChain }
                : { select: () => cartsChain, update: () => ({ eq: updateEq }) },
    };
    return { client, updateEq };
}

const OLD = "2020-01-01T00:00:00Z"; // safely past any delay

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/abandoned-cart-recovery", () => {
    it("nudges + marks reminded for an opted-in tenant past its delay", async () => {
        const { client, updateEq } = makeClient(
            [
                {
                    id: "c1",
                    tenant_id: "t1",
                    phone: "07700000000",
                    items: [],
                    subtotal_iqd: 1000,
                    updated_at: OLD,
                },
            ],
            [
                {
                    id: "t1",
                    store_config_v2: {
                        commerce: { cart_recovery: { enabled: true, delay_minutes: 30 } },
                    },
                },
            ],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
        });

        const res = await GET(new Request("http://x/api/cron/abandoned-cart-recovery"));
        const json = await res.json();
        expect(json.sent).toBe(1);
        expect(json.skipped).toBe(0);
        expect(sendCartRecoveryMessage).toHaveBeenCalledTimes(1);
        expect(updateEq).toHaveBeenCalledTimes(1);
    });

    it("skips carts of a tenant that hasn't opted in", async () => {
        const { client } = makeClient(
            [
                {
                    id: "c1",
                    tenant_id: "t1",
                    phone: "07700000000",
                    items: [],
                    subtotal_iqd: 1000,
                    updated_at: OLD,
                },
            ],
            [{ id: "t1", store_config_v2: { commerce: { cart_recovery: { enabled: false } } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(new Request("http://x/api/cron/abandoned-cart-recovery"));
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.skipped).toBe(1);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });
});
