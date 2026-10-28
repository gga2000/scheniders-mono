import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));
// The cron guard now fails CLOSED, so these tests present the real calling
// convention — a configured secret plus a matching Bearer header — instead of
// relying on the check disabling itself when no secret was set.
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));
vi.mock("@/lib/abandoned-cart-sender", () => ({
    sendCartRecoveryMessage: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendCartRecoveryMessage } from "@/lib/abandoned-cart-sender";

/** A request carrying the cron secret, as Vercel Cron sends it. */
function authedRequest() {
    return new Request("http://x/api/cron/abandoned-cart-recovery", {
        headers: { authorization: "Bearer test-cron-secret" },
    });
}

type Cart = Record<string, unknown>;

/** The carts query APPLIES its `is` / `not is` filters, so a cart is only
 *  kept out of the sweep if the route actually asked for that. */
function makeClient(
    carts: Cart[],
    tenants: unknown[],
    sweptCheckouts: Array<{ tenant_id: string; outcome: string; removed: number }> = [],
) {
    const rpc = vi.fn(() => Promise.resolve({ data: sweptCheckouts, error: null }));
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const predicates: Array<(r: Cart) => boolean> = [];
    const cartsChain: Record<string, unknown> = {};
    cartsChain.is = (col: string, value: unknown) => {
        predicates.push((r) => (r[col] ?? null) === value);
        return cartsChain;
    };
    cartsChain.not = (col: string, operator: string, value: unknown) => {
        if (operator !== "is") throw new Error(`unsupported not.${operator}`);
        predicates.push((r) => (r[col] ?? null) !== value);
        return cartsChain;
    };
    cartsChain.lte = () => cartsChain;
    cartsChain.order = () => cartsChain;
    cartsChain.limit = () =>
        Promise.resolve({ data: carts.filter((c) => predicates.every((p) => p(c))), error: null });
    const tenantsChain = {
        in: () => Promise.resolve({ data: tenants, error: null }),
    };
    const client = {
        rpc,
        from: (table: string) =>
            table === "tenants"
                ? { select: () => tenantsChain }
                : { select: () => cartsChain, update: () => ({ eq: updateEq }) },
    };
    return { client, updateEq, rpc };
}

const OLD = "2020-01-01T00:00:00Z"; // safely past any delay
const CONSENTED = "2020-01-01T00:00:00Z";

function cart(overrides: Cart = {}): Cart {
    return {
        id: "c1",
        tenant_id: "t1",
        phone: "07700000000",
        items: [],
        subtotal_iqd: 1000,
        updated_at: OLD,
        consent_at: CONSENTED,
        ...overrides,
    };
}

const optedIn = {
    id: "t1",
    store_config_v2: { commerce: { cart_recovery: { enabled: true, delay_minutes: 30 } } },
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/abandoned-cart-recovery", () => {
    it("nudges + marks reminded for a consented cart of an opted-in tenant past its delay", async () => {
        const { client, updateEq } = makeClient([cart()], [optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
        });

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(1);
        expect(json.skipped).toBe(0);
        expect(sendCartRecoveryMessage).toHaveBeenCalledTimes(1);
        expect(updateEq).toHaveBeenCalledTimes(1);
    });

    it("never messages a capture without consent, even for an opted-in tenant", async () => {
        const { client, updateEq } = makeClient([cart({ consent_at: null })], [optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.processed).toBe(0);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
        expect(updateEq).not.toHaveBeenCalled();
    });

    it("skips carts of a tenant that hasn't opted in", async () => {
        const { client } = makeClient(
            [cart()],
            [{ id: "t1", store_config_v2: { commerce: { cart_recovery: { enabled: false } } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.skipped).toBe(1);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("sends nothing for a store with no cart_recovery key at all (scheniders-iraq today)", async () => {
        const { client } = makeClient(
            [cart()],
            [{ id: "t1", store_config_v2: { commerce: { shipping: {} } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.skipped).toBe(1);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("moves junk and 14-day-old abandoned checkouts to the trash and reports them by reason", async () => {
        const { client, rpc } = makeClient([], [], [
            { tenant_id: "t1", outcome: "expired", removed: 3 },
            { tenant_id: "t2", outcome: "expired", removed: 2 },
            { tenant_id: "t1", outcome: "junk_location", removed: 1 },
        ]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(rpc).toHaveBeenCalledWith("sweep_abandoned_carts", { _expire_after: "14 days" });
        expect(json.checkoutsRemoved).toEqual({ expired: 5, junk_location: 1 });
    });

    it("THE RISK: refuses an unauthenticated caller", async () => {
        const res = await GET(new Request("http://x/api/cron/abandoned-cart-recovery"));
        expect(res.status).toBe(401);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("refuses a caller presenting the wrong secret", async () => {
        const res = await GET(
            new Request("http://x/api/cron/abandoned-cart-recovery", {
                headers: { authorization: "Bearer wrong" },
            }),
        );
        expect(res.status).toBe(401);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });
});
