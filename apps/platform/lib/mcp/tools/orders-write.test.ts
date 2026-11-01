import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));

const applyStatusSideEffect = vi.fn();
vi.mock("@/lib/orders/status-side-effects", () => ({
    applyStatusSideEffect: (...a: unknown[]) => applyStatusSideEffect(...a),
}));

const createOrderForTenant = vi.fn();
vi.mock("@/lib/order-service", () => ({ createOrderForTenant: (...a: unknown[]) => createOrderForTenant(...a) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { registerOrderWriteTools } from "./orders-write";

const STORE = "tenant-a";
const OTHER = "tenant-b";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = {
        registerTool: (name: string, _config: unknown, cb: Handler) => {
            registered[name] = cb;
        },
    } as unknown as McpServer;
    registerOrderWriteTools(server);
    return registered;
}

function order(id: string, orderId: string, tenant: string, status = "confirmed") {
    return {
        id,
        order_id: orderId,
        tenant_id: tenant,
        status,
        version: 3,
        customer_name: "Zahraa",
        phone: "07701234567",
        city: "بغداد",
        address_details: "Karrada",
        items: [{ name: "Serum", quantity: 1, price: 25000, product_id: "p1" }],
        price: 25000,
        delivery_fee: 5000,
        deleted_at: null,
    };
}

let env: ReturnType<typeof fakeDb>;

function asCaller(role: McpCaller["role"] = "admin") {
    resolveMcpCaller.mockResolvedValue({
        ok: true,
        caller: {
            userId: "u1",
            email: "ali@example.com",
            displayName: "Ali",
            tenantId: STORE,
            role,
            clientId: "claude",
            db: env.db,
            token: "tok",
            appUrl: "https://app.test",
        } satisfies McpCaller,
    });
}

const call = async (name: string, args: Record<string, unknown>) => {
    const res = await tools()[name](args, { http: { authInfo: {} } });
    return { text: res.content[0].text, isError: res.isError === true };
};

beforeEach(() => {
    vi.clearAllMocks();
    applyStatusSideEffect.mockResolvedValue({ success: true });
    env = fakeDb({
        orders: [order("o1", "1001", STORE), order("o2", "1002", STORE, "new"), order("x1", "1001-B", OTHER)],
        order_status_history: [],
        activity_logs: [],
        order_notes: [],
    });
    asCaller();
});

describe("update_order_status", () => {
    it("changes one order like the orders page: guarded patch, history, side effects, activity log", async () => {
        const res = await call("update_order_status", { orders: ["1001"], status: "in_transit", confirm: false });

        expect(res.isError).toBe(false);
        expect(res.text).toContain("1 of 1 order(s) moved");
        expect(env.tables.orders[0]).toMatchObject({ status: "in_transit", version: 4, last_status_changed_by_name: "Ali (via Claude)" });

        const patch = env.calls.find((c) => c.table === "orders" && c.op === "update");
        expect(patch?.filters).toEqual(expect.arrayContaining([`tenant_id=${STORE}`, "id=o1", "version=3"]));

        // The history row is the database trigger's (trg_log_order_status_change), not the tool's.
        expect(env.tables.order_status_history).toEqual([]);
        expect(applyStatusSideEffect).toHaveBeenCalledWith(env.db, expect.objectContaining({ orderId: "o1", tenantId: STORE, from: "confirmed", to: "in_transit" }));
        const actions = env.tables.activity_logs.map((r) => r.action);
        expect(actions).toEqual(["order.status_change", "mcp.tool_call"]);
    });

    it("only previews a bulk change until confirm is true", async () => {
        const preview = await call("update_order_status", { orders: ["1001", "1002"], status: "cancelled", confirm: false });
        expect(preview.text).toMatch(/^Preview — nothing changed yet/);
        expect(env.tables.orders.map((o) => o.status)).toEqual(["confirmed", "new", "confirmed"]);
        expect(env.calls.some((c) => c.op === "update")).toBe(false);

        const done = await call("update_order_status", { orders: ["1001", "1002"], status: "cancelled", reason: "Customer asked", confirm: true });
        expect(done.text).toContain("2 of 2 order(s) moved");
        expect(env.tables.orders.slice(0, 2).map((o) => o.status)).toEqual(["cancelled", "cancelled"]);
    });

    it("previews an unusual single change (never shipped → delivered)", async () => {
        const res = await call("update_order_status", { orders: ["1002"], status: "delivered", confirm: false });
        expect(res.text).toContain("Preview");
        expect(res.text).toContain("never shipped");
        expect(env.tables.orders[1].status).toBe("new");
    });

    it("delivers a return order as refund_delivered, like the orders page", async () => {
        env.tables.orders.push({ ...order("r1", "1003", STORE, "in_transit"), is_return: true });
        const res = await call("update_order_status", { orders: ["1003"], status: "delivered", confirm: false });
        expect(res.text).toContain("in_transit → refund_delivered");
        expect(env.tables.orders[3].status).toBe("refund_delivered");
    });

    it("cannot reach another store's order", async () => {
        const res = await call("update_order_status", { orders: ["1001-B"], status: "cancelled", confirm: true });
        expect(res).toEqual({ isError: true, text: "No order 1001-B in this store." });
        expect(env.tables.orders[2].status).toBe("confirmed");
    });

    it("refuses a viewer", async () => {
        asCaller("viewer");
        const res = await call("update_order_status", { orders: ["1001"], status: "cancelled", confirm: true });
        expect(res).toEqual({ isError: true, text: "Your role in this store is read-only." });
        expect(env.tables.orders[0].status).toBe("confirmed");
    });

    it("reports a concurrent edit instead of overwriting it", async () => {
        const realFrom = env.db.from.bind(env.db);
        // Someone else saves the order between Claude's read and its write.
        vi.spyOn(env.db, "from").mockImplementation((table: string) => {
            const chain = realFrom(table);
            if (table === "orders") {
                const update = chain.update.bind(chain);
                chain.update = (patch: Record<string, unknown>) => {
                    env.tables.orders[0].version = 9;
                    return update(patch);
                };
            }
            return chain;
        });
        const res = await call("update_order_status", { orders: ["1001"], status: "in_transit", confirm: true });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("changed while Claude was working on it");
        expect(env.tables.orders[0].status).toBe("confirmed");
        expect(env.tables.order_status_history).toHaveLength(0);
    });
});

describe("update_order", () => {
    it("writes only the fields that change, normalizing the phone and governorate", async () => {
        const res = await call("update_order", { order: "1001", phone: "+964 770 123 4567", governorate: "Basra", address_details: "Ashar" });
        expect(res.isError).toBe(false);
        const patch = env.calls.find((c) => c.table === "orders" && c.op === "update");
        // The phone normalizes to the stored value, so it is not part of the write.
        expect(patch?.payload).toEqual({ city: "البصرة", governorate_code: "BAS", address_details: "Ashar" });
        expect(patch?.filters).toEqual(expect.arrayContaining([`tenant_id=${STORE}`, "version=3"]));
        expect(env.tables.activity_logs[0]).toMatchObject({ action: "order.edit", entity_id: "o1" });
    });
});

describe("update_order source, items and price", () => {
    const SERUM = "11111111-1111-4111-8111-111111111111";
    beforeEach(() => {
        env.tables.products = [
            { id: SERUM, tenant_id: STORE, name: "Serum Long Marketing Title", short_name: "Serum", price: 25000, sku: "SR", image_url: null, compare_at_price: null, is_archived: false },
        ];
        asCaller();
    });

    it("changes the source straight away", async () => {
        const res = await call("update_order", { order: "1001", source: "meta" });
        expect(res.isError).toBe(false);
        expect(env.tables.orders[0].source).toBe("meta");
    });

    it("previews a new item list and price, then applies it with the short name", async () => {
        const args = { order: "1001", items: [{ product_id: SERUM, quantity: 2 }], discount: 5000 };
        const preview = await call("update_order", { ...args, confirm: false });
        expect(preview.text).toMatch(/^Preview — nothing changed yet/);
        expect(preview.text).toContain("price: 25,000 IQD → 45,000 IQD");
        expect(env.calls.some((c) => c.op === "update")).toBe(false);

        const done = await call("update_order", { ...args, confirm: true });
        expect(done.isError).toBe(false);
        expect(env.tables.orders[0]).toMatchObject({
            price: 45000,
            discount_amount: 5000,
            items: [expect.objectContaining({ name: "Serum", quantity: 2, price: 25000 })],
        });
    });

    it("takes an explicit price over the computed one", async () => {
        await call("update_order", { order: "1001", price: 20000, confirm: true });
        expect(env.tables.orders[0].price).toBe(20000);
    });

    it("locks items once the courier has the order, and the price once it is delivered", async () => {
        env.tables.orders[0].status = "in_transit";
        const items = await call("update_order", { order: "1001", items: [{ product_id: SERUM, quantity: 1 }], confirm: true });
        expect(items.isError).toBe(true);
        expect(items.text).toContain("items are locked");
        const price = await call("update_order", { order: "1001", price: 20000, confirm: true });
        expect(price.isError).toBe(false);

        env.tables.orders[0].status = "delivered";
        const late = await call("update_order", { order: "1001", price: 10000, confirm: true });
        expect(late.isError).toBe(true);
        expect(late.text).toContain("price is locked");
    });
});

describe("update_order validation", () => {
    it("refuses a phone the courier cannot call", async () => {
        const res = await call("update_order", { order: "1001", phone: "call me later" });
        expect(res).toEqual({ isError: true, text: 'Phone "call me later" is not an Iraqi mobile number (07XX XXX XXXX).' });
        expect(env.calls.some((c) => c.op === "update")).toBe(false);
    });
});

describe("update_order_status lookups", () => {
    it("finds every order of a bulk change in one query, and names all missing ones", async () => {
        const res = await call("update_order_status", { orders: ["1001", "9998", "1002", "9999"], status: "cancelled", confirm: true });
        expect(res).toEqual({ isError: true, text: "No order 9998, 9999 in this store." });
        expect(env.calls.filter((c) => c.table === "orders" && c.op === "select")).toHaveLength(1);
        expect(env.tables.orders.slice(0, 2).map((o) => o.status)).toEqual(["confirmed", "new"]);
    });
});

describe("create_order", () => {
    beforeEach(() => {
        env.tables.products = [
            { id: "11111111-1111-4111-8111-111111111111", tenant_id: STORE, name: "Serum Long Marketing Title", short_name: "Serum", price: 25000, sku: "SR", image_url: null, compare_at_price: null, is_archived: false },
            { id: "22222222-2222-4222-8222-222222222222", tenant_id: OTHER, name: "Foreign", price: 1000, sku: null, image_url: null, compare_at_price: null, is_archived: false },
        ];
        asCaller();
    });

    const base = {
        customer_name: "Hussein",
        phone: "7801234567",
        governorate: "النجف",
        address_details: "Hay Al-Ameer",
        delivery_fee: 5000,
        discount: 5000,
    };

    it("prices from the catalog and previews before creating", async () => {
        const res = await call("create_order", { ...base, items: [{ product_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }], confirm: false });
        expect(res.text).toContain("Items total 50,000 IQD − discount 5,000 IQD = 45,000 IQD");
        expect(createOrderForTenant).not.toHaveBeenCalled();
    });

    it("puts the product's short name and the chosen source on the order", async () => {
        createOrderForTenant.mockResolvedValue({ success: true, data: { ...order("o9", "1009", STORE), price: 45000 } });
        await call("create_order", { ...base, source: "whatsapp", items: [{ product_id: "11111111-1111-4111-8111-111111111111", quantity: 2, price: 24000 }], confirm: true });
        expect(createOrderForTenant).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "whatsapp",
                price: 43000,
                items: [expect.objectContaining({ name: "Serum", price: 24000, quantity: 2 })],
            }),
            STORE,
        );
    });

    it("creates through the New order service in the caller's verified store", async () => {
        createOrderForTenant.mockResolvedValue({ success: true, data: { ...order("o9", "1009", STORE), price: 45000 } });
        const res = await call("create_order", { ...base, items: [{ product_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }], confirm: true });
        expect(res.text).toContain("Created order #1009");
        expect(createOrderForTenant).toHaveBeenCalledWith(
            expect.objectContaining({ phone: "07801234567", city: "النجف", price: 45000, discount_amount: 5000, delivery_fee: 5000, status: "confirmed" }),
            STORE,
        );
    });

    it("refuses a discount larger than the items", async () => {
        const res = await call("create_order", { ...base, discount: 60000, items: [{ product_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }], confirm: true });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("is more than the items total");
        expect(createOrderForTenant).not.toHaveBeenCalled();
    });

    it("refuses a product from another store", async () => {
        const res = await call("create_order", { ...base, items: [{ product_id: "22222222-2222-4222-8222-222222222222", quantity: 1 }], confirm: true });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("is not in this store's catalog");
        expect(createOrderForTenant).not.toHaveBeenCalled();
    });
});
