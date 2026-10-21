// @vitest-environment node
import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node, not the platform default jsdom: the QStash Receiver verifies with
// jose, which rejects jsdom's cross-realm Uint8Array.

type Row = Record<string, unknown>;
type Filter = [op: "eq" | "is", column: string, value: unknown];

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    triggerImmediateConfirmation: vi.fn(),
    sendNewOrderAlertToStaff: vi.fn(),
    db: {
        rows: [] as Array<Record<string, unknown>>,
        failRead: false,
        beforeClaim: null as null | ((rows: Array<Record<string, unknown>>) => void),
        claims: [] as Array<{ values: Record<string, unknown>; matched: number; filters: Array<[string, string, unknown]> }>,
    },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/whatsapp-dispatcher", () => ({
    triggerImmediateConfirmation: mocks.triggerImmediateConfirmation,
}));
vi.mock("@/lib/staff-alerts", () => ({ sendNewOrderAlertToStaff: mocks.sendNewOrderAlertToStaff }));
// A PostgREST double that APPLIES the filters, so the claim only matches
// when the route really scoped it to the row, its tenant, and NULL.
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => {
            if (table !== "orders") throw new Error(`unexpected table ${table}`);
            const filters: Array<[string, string, unknown]> = [];
            let values: Record<string, unknown> | null = null;
            const matching = () =>
                mocks.db.rows.filter((r) =>
                    filters.every(([op, col, v]) => (op === "eq" ? r[col] === v : (r[col] ?? null) === v)),
                );
            const chain = {
                select: () => chain,
                update: (v: Record<string, unknown>) => {
                    values = v;
                    return chain;
                },
                eq: (col: string, v: unknown) => {
                    filters.push(["eq", col, v]);
                    return chain;
                },
                is: (col: string, v: unknown) => {
                    filters.push(["is", col, v]);
                    return chain;
                },
                maybeSingle: async () =>
                    mocks.db.failRead
                        ? { data: null, error: { message: "read failed" } }
                        : { data: matching()[0] ?? null, error: null },
                then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => {
                    if (values) mocks.db.beforeClaim?.(mocks.db.rows);
                    const hit = matching();
                    if (values) {
                        for (const r of hit) Object.assign(r, values);
                        mocks.db.claims.push({ values, matched: hit.length, filters: [...filters] });
                    }
                    return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve, reject);
                },
            };
            return chain;
        },
    }),
}));

import { POST } from "./route";

const CURRENT_KEY = "sig_current_test_key";
const NEXT_KEY = "sig_next_test_key";
const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER_TENANT = "55555555-5555-4555-8555-555555555555";
const ORDER = "33333333-3333-4333-8333-333333333333";
const OTHER_ORDER = "66666666-6666-4666-8666-666666666666";
const URL = "https://platform.example.com/api/webhooks/storefront-order";

function b64url(s: string): string {
    return Buffer.from(s).toString("base64url");
}

/** A QStash signature as QStash mints it: an HS256 JWT, issuer "Upstash",
 *  with the body's SHA-256 in the `body` claim. Real crypto, no mock. */
function qstashSignature(body: string, key: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(
        JSON.stringify({
            iss: "Upstash",
            sub: URL,
            iat: now,
            nbf: now,
            exp: now + 300,
            jti: randomUUID(),
            body: createHash("sha256").update(body).digest("base64url"),
        }),
    );
    const sig = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${sig}`;
}

function delivery(body: unknown, opts: { key?: string; signedBody?: string } = {}): Request {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return new Request(URL, {
        method: "POST",
        body: raw,
        headers: {
            "content-type": "application/json",
            "upstash-signature": qstashSignature(opts.signedBody ?? raw, opts.key ?? CURRENT_KEY),
        },
    });
}

function storefrontOrder(overrides: Row = {}): Row {
    return {
        id: ORDER,
        order_id: "4261021001",
        tenant_id: TENANT,
        customer_name: "علي حسن",
        phone: "07701234567",
        secondary_phone: null,
        items: [{ name: "عطر", quantity: 1, price: 35000 }],
        price: 35000,
        discount_amount: 0,
        delivery_fee: 5000,
        source: "storefront",
        is_test: false,
        status: "new",
        deleted_at: null,
        confirmation_dispatched_at: null,
        ...overrides,
    };
}

beforeEach(() => {
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    Object.assign(mocks.env, {
        QSTASH_CURRENT_SIGNING_KEY: CURRENT_KEY,
        QSTASH_NEXT_SIGNING_KEY: NEXT_KEY,
        STOREFRONT_WA_CONFIRM_TENANT_IDS: TENANT,
    });
    mocks.db.rows = [storefrontOrder()];
    mocks.db.failRead = false;
    mocks.db.beforeClaim = null;
    mocks.db.claims = [];
    mocks.triggerImmediateConfirmation.mockReset().mockResolvedValue(undefined);
    mocks.sendNewOrderAlertToStaff.mockReset().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/webhooks/storefront-order — who may call", () => {
    it("refuses every delivery while the signing keys are not configured", async () => {
        delete mocks.env.QSTASH_CURRENT_SIGNING_KEY;
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(401);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("refuses a message not signed with the QStash keys", async () => {
        const res = await POST(delivery({ order_id: ORDER }, { key: "attacker-key" }));
        expect(res.status).toBe(401);
        expect(mocks.db.claims).toHaveLength(0);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("refuses a body that differs from the one QStash signed", async () => {
        const res = await POST(
            delivery({ order_id: ORDER }, { signedBody: JSON.stringify({ order_id: OTHER_ORDER }) }),
        );
        expect(res.status).toBe(401);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("accepts the next signing key (QStash key rotation)", async () => {
        const res = await POST(delivery({ order_id: ORDER }, { key: NEXT_KEY }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });
    });

    it("rejects a signed message without an order uuid", async () => {
        const res = await POST(delivery({ order_id: "SH-0001" }));
        expect(res.status).toBe(400);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });
});

describe("POST /api/webhooks/storefront-order — what gets sent", () => {
    it("asks QStash to retry when the order cannot be read", async () => {
        mocks.db.failRead = true;
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(500);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("asks QStash to retry when the row has no claim column (migration not applied)", async () => {
        const legacy = storefrontOrder();
        delete legacy.confirmation_dispatched_at;
        mocks.db.rows = [legacy];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(500);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("stops for an order id that does not exist", async () => {
        mocks.db.rows = [];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "not_found" });
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it.each<[string, Row]>([
        ["test_order", { is_test: true }],
        ["not_storefront", { source: "lightfunnels" }],
        ["not_new", { status: "contacted" }],
        ["tenant_not_enabled", { tenant_id: OTHER_TENANT }],
        ["deleted", { deleted_at: "2026-10-21T10:00:00.000Z" }],
    ])("sends nothing for %s", async (reason, overrides) => {
        mocks.db.rows = [storefrontOrder(overrides)];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: reason });
        expect(mocks.db.claims).toHaveLength(0);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
        expect(mocks.sendNewOrderAlertToStaff).not.toHaveBeenCalled();
    });

    it("claims, confirms and alerts staff, with the tenant taken from the row", async () => {
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });

        expect(mocks.db.claims).toHaveLength(1);
        expect(mocks.db.claims[0].matched).toBe(1);
        expect(mocks.db.claims[0].filters).toEqual(
            expect.arrayContaining<Filter>([
                ["eq", "id", ORDER],
                ["eq", "tenant_id", TENANT],
                ["eq", "source", "storefront"],
                ["eq", "status", "new"],
                ["is", "confirmation_dispatched_at", null],
            ]),
        );
        expect(typeof mocks.db.rows[0].confirmation_dispatched_at).toBe("string");

        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledWith(ORDER, "07701234567");
        expect(mocks.sendNewOrderAlertToStaff).toHaveBeenCalledWith(
            expect.objectContaining({ id: ORDER, order_id: "4261021001" }),
            TENANT,
        );
        // Same order as the Lightfunnels webhook: the customer first, then staff.
        expect(mocks.triggerImmediateConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.sendNewOrderAlertToStaff.mock.invocationCallOrder[0],
        );
    });

    it("a redelivered message sends nothing the second time", async () => {
        await POST(delivery({ order_id: ORDER }));
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "already_dispatched" });
        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledTimes(1);
        expect(mocks.sendNewOrderAlertToStaff).toHaveBeenCalledTimes(1);
    });

    it("a concurrent delivery that loses the claim sends nothing", async () => {
        mocks.db.beforeClaim = (rows) => {
            rows[0].confirmation_dispatched_at = "2026-10-21T10:00:00.000Z";
        };
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "claimed_elsewhere" });
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
        expect(mocks.sendNewOrderAlertToStaff).not.toHaveBeenCalled();
    });

    it("a staff-alert failure is logged and does not undo the confirmation", async () => {
        mocks.sendNewOrderAlertToStaff.mockRejectedValue(new Error("interakt down"));
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });
        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalled();
    });
});
