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
// Every test store may send on the shared number except "t-blocked".
vi.mock("@/lib/interakt", () => ({ sharedSenderAllows: (id: string) => id !== "t-blocked" }));
const limiter = vi.hoisted(() => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => limiter);

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
    cartsChain.eq = (col: string, value: unknown) => {
        predicates.push((r) => r[col] === value);
        return cartsChain;
    };
    cartsChain.in = (col: string, values: unknown[]) => {
        predicates.push((r) => values.includes(r[col]));
        return cartsChain;
    };
    cartsChain.lte = () => cartsChain;
    cartsChain.gte = (col: string, value: string) => {
        predicates.push((r) => String(r[col]) >= value);
        return cartsChain;
    };
    cartsChain.order = () => cartsChain;
    cartsChain.limit = (n: number) => {
        const rows = carts.filter((c) => predicates.every((p) => p(c))).slice(0, n);
        predicates.length = 0;
        return Promise.resolve({ data: rows, error: null });
    };
    // The route asks for opted-in stores only: apply that filter like the database would.
    const tenantsChain = {
        eq: (path: string, value: string) => {
            if (path !== "store_config_v2->commerce->cart_recovery->>enabled") throw new Error(`unexpected filter ${path}`);
            const enabled = (tenants as Array<{ store_config_v2?: { commerce?: { cart_recovery?: { enabled?: unknown } } } }>)
                .filter((t) => String(t.store_config_v2?.commerce?.cart_recovery?.enabled) === value);
            return Promise.resolve({ data: enabled, error: null });
        },
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

// Past any delay (24 h at most) and inside the 48 h window the sweep still nudges.
const OLD = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
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

beforeEach(() => {
    vi.clearAllMocks();
    limiter.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 39, retryAfterSeconds: 0 });
});

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

    it("stops a store's paid sends at the daily cap, and when the limiter is down", async () => {
        for (const verdict of [
            { allowed: false, remaining: 0, retryAfterSeconds: 60 },
            { allowed: false, remaining: 0, retryAfterSeconds: 0, error: "down" },
        ]) {
            const { client, updateEq } = makeClient([cart()], [optedIn]);
            (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
            limiter.consumeRateLimit.mockResolvedValueOnce(verdict);
            const json = await (await GET(authedRequest())).json();
            expect(json.sent).toBe(0);
            expect(json.skipped).toBe(1);
            expect(updateEq).not.toHaveBeenCalled();
        }
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
        expect(limiter.consumeRateLimit).toHaveBeenCalledWith("cart-recovery:t1", 40, 86_400);
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
        expect(json.processed).toBe(0);
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
        expect(json.processed).toBe(0);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("an opted-out store's backlog no longer starves an opted-in store", async () => {
        const backlog = Array.from({ length: 60 }, (_, i) => cart({ id: `off-${i}`, tenant_id: "t-off" }));
        const { client } = makeClient(
            [...backlog, cart({ id: "on-1" })],
            [optedIn, { id: "t-off", store_config_v2: { commerce: { cart_recovery: { enabled: false } } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const json = await (await GET(authedRequest())).json();
        expect(json).toMatchObject({ processed: 1, sent: 1 });
    });

    it("one store's flood of captures or spent budget never starves another store", async () => {
        const flood = Array.from({ length: 80 }, (_, i) => cart({ id: `a-${i}`, tenant_id: "t-a" }));
        const storeA = { ...optedIn, id: "t-a" };
        const { client } = makeClient([...flood, cart({ id: "b-1" })], [storeA, optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        // Store A's daily budget is already spent.
        limiter.consumeRateLimit.mockImplementation(async (key: string) =>
            key === "cart-recovery:t-a"
                ? { allowed: false, remaining: 0, retryAfterSeconds: 60 }
                : { allowed: true, remaining: 39, retryAfterSeconds: 0 },
        );

        const json = await (await GET(authedRequest())).json();
        expect(json.sent).toBe(1);
        expect(sendCartRecoveryMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "b-1" }));
        // A stops at its first refused cart instead of burning the batch.
        expect(limiter.consumeRateLimit.mock.calls.filter((c) => c[0] === "cart-recovery:t-a")).toHaveLength(1);
    });

    it("never reads carts of a store not allowed on the shared number", async () => {
        const blocked = { ...optedIn, id: "t-blocked" };
        const { client } = makeClient([cart({ tenant_id: "t-blocked" })], [blocked]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const json = await (await GET(authedRequest())).json();
        expect(json.processed).toBe(0);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("never nudges a cart idle for more than two days", async () => {
        const { client } = makeClient([cart({ updated_at: "2020-01-01T00:00:00Z" })], [optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const json = await (await GET(authedRequest())).json();
        expect(json.processed).toBe(0);
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
