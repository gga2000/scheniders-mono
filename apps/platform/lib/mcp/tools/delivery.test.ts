import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));

const createAfterSaleOrder = vi.fn();
const receiveAfterSaleItem = vi.fn();
vi.mock("@/lib/after-sale/create", () => ({
    createAfterSaleOrder: (...a: unknown[]) => createAfterSaleOrder(...a),
    receiveAfterSaleItem: (...a: unknown[]) => receiveAfterSaleItem(...a),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { registerDeliveryTools } from "./delivery";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const STORE = "tenant-a";
const OTHER = "tenant-b";
const SERUM = "11111111-1111-4111-8111-111111111111";

let env: ReturnType<typeof fakeDb>;

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, cb: Handler) => void (registered[name] = cb) } as unknown as McpServer;
    registerDeliveryTools(server);
    return registered;
}

function asCaller(role: McpCaller["role"] = "admin") {
    resolveMcpCaller.mockResolvedValue({
        ok: true,
        caller: {
            userId: "u1", email: null, displayName: "Ali", tenantId: STORE, role, clientId: "c", db: env.db, token: "t",
            appUrl: "https://app.test",
        },
    });
}

const call = async (name: string, args: Record<string, unknown>) => {
    const res = await tools()[name](args, {});
    return { text: res.content[0].text, isError: res.isError === true };
};

function order(id: string, orderId: string, tenant: string, extra: Record<string, unknown> = {}) {
    return {
        id, order_id: orderId, tenant_id: tenant, status: "confirmed", version: 1,
        customer_name: "Zahraa", phone: "07701234567", city: "بغداد", governorate_code: "BGD", address_details: "Karrada",
        items: [{ name: "Serum", quantity: 2, price: 25000, product_id: SERUM }],
        price: 50000, delivery_fee: 5000, payment_status: "cod", is_return: false, is_replacement: false, deleted_at: null,
        ...extra,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    env = fakeDb({
        orders: [
            order("o1", "1001", STORE),
            order("o2", "1002", STORE, { scheduled_date: "2099-01-01" }),
            order("o3", "1003", STORE, { status: "new", city: "", governorate_code: null, address_details: "" }),
            order("o4", "1004", OTHER),
            order("o5", "1005", STORE, { status: "delivered" }),
        ],
        print_batches: [],
        after_sale_items: [],
        tenants: [{ id: STORE, settings: { after_sale: { default_fee_kept: 5000 } } }],
        products: [
            { id: SERUM, tenant_id: STORE, name: "Serum", sku: "SR-1", price: 30000, compare_at_price: null, stock_quantity: 1, reserved_quantity: 0, is_visible: true, is_archived: false, is_supply: false },
        ],
        product_variants: [],
        activity_logs: [],
    });
    asCaller();
});

describe("ship_orders", () => {
    it("previews without recording, keeps later-day orders back and flags what the courier cannot use", async () => {
        const res = await call("ship_orders", { orders: ["1001", "1002", "1003"], company: "prime", include_scheduled_later: false, confirm: false });
        expect(res.text).toMatch(/^Preview/);
        expect(res.text).toContain("Prime batch: 2 orders, COD to collect 110,000 IQD.");
        expect(res.text).toContain("Kept back (scheduled for a later day): #1002");
        expect(res.text).toContain("Not confirmed: #1003 (new)");
        expect(res.text).toContain("No governorate the courier can read (fix the address first): #1003");
        expect(env.tables.print_batches).toHaveLength(0);
    });

    it("records the batch in the caller's store and links to the file", async () => {
        const res = await call("ship_orders", { orders: ["1001"], company: "waseet", include_scheduled_later: false, confirm: true });
        expect(env.tables.print_batches).toEqual([
            expect.objectContaining({ tenant_id: STORE, order_ids: ["o1"], invoice_template: "waseet", order_count: 1, total_value: 50000 }),
        ]);
        expect(res.text).toContain("https://app.test/shipping-export/print_batches-1");
        expect(res.text).toContain("Order statuses are unchanged.");
    });

    it("cannot put another store's order in a batch", async () => {
        const res = await call("ship_orders", { orders: ["1004"], company: "prime", include_scheduled_later: false, confirm: true });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("No order 1004");
        expect(env.tables.print_batches).toHaveLength(0);
    });

    it("refuses a viewer", async () => {
        asCaller("viewer");
        const res = await call("ship_orders", { orders: ["1001"], company: "prime", include_scheduled_later: false, confirm: true });
        expect(res).toEqual({ isError: true, text: "Your role in this store is read-only." });
    });
});

describe("refund_order", () => {
    it("previews from what is left, then creates through the shared after-sale path with the caller's store", async () => {
        env.tables.after_sale_items.push({ tenant_id: STORE, order_id: "c1", original_order_id: "o5", direction: "back", original_line_index: 0, qty: 1, amount: 25000 });
        env.tables.orders.push({ ...order("c1", "RTN-1005-1", STORE, { status: "refund_delivered", is_return: true }), original_order_id: "o5" });

        const preview = await call("refund_order", { order: "1005", customer_keeps: false, keep_pickup_fee: true, confirm: false });
        expect(preview.text).toContain("1. Serum ×2, paid 50,000 IQD, 1 already taken back");
        expect(preview.text).toContain("Items 25,000 IQD − pickup fee kept 5,000 IQD = customer receives 20,000 IQD.");
        expect(createAfterSaleOrder).not.toHaveBeenCalled();

        createAfterSaleOrder.mockResolvedValue({ success: true, orderId: "c2", orderNumber: "RTN-1005-2" });
        const done = await call("refund_order", { order: "1005", customer_keeps: false, keep_pickup_fee: true, reason: "Damaged", confirm: true });
        expect(done.text).toContain("Created refund #RTN-1005-2.");
        expect(createAfterSaleOrder).toHaveBeenCalledWith(
            { userId: "u1", tenantId: STORE, role: "admin", actorName: "Ali (via Claude)" },
            expect.objectContaining({
                kind: "refund",
                originalOrderId: "o5",
                lines: [{ originalLine: 0, qty: 1, expectsBack: true }],
                feeKept: 5000,
                reason: "Damaged",
            }),
        );
    });

    it("refuses an order that was not delivered", async () => {
        const res = await call("refund_order", { order: "1001", customer_keeps: false, keep_pickup_fee: true, confirm: true });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("Only a delivered order");
        expect(createAfterSaleOrder).not.toHaveBeenCalled();
    });

    it("waits for an open refund to settle", async () => {
        env.tables.orders.push({ ...order("c1", "RTN-1005-1", STORE, { status: "return_pending", is_return: true }), original_order_id: "o5" });
        const res = await call("refund_order", { order: "1005", customer_keeps: false, keep_pickup_fee: true, confirm: false });
        expect(res.text).toContain("still open");
    });

    it("keeps refunds without a pickup to admins", async () => {
        asCaller("employee");
        const res = await call("refund_order", { order: "1005", customer_keeps: true, keep_pickup_fee: false, note: "gift", confirm: false });
        expect(res.text).toBe("Only an owner or admin can refund without a pickup.");
    });

    it("refuses more units than are left on a line", async () => {
        const res = await call("refund_order", { order: "1005", lines: [{ line: 1, qty: 3 }], customer_keeps: false, keep_pickup_fee: true, confirm: false });
        expect(res.text).toContain("3 asked, 2 left to take back");
    });
});

describe("replace_order", () => {
    it("prices new items from the catalog, warns on stock, and creates the replacement", async () => {
        const preview = await call("replace_order", {
            order: "1005", lines: [{ line: 1, qty: 1 }], new_items: [{ product: "SR-1", qty: 2 }], customer_pays_delivery: true, confirm: false,
        });
        expect(preview.text).toContain("Serum ×2 @ 30,000 IQD");
        expect(preview.text).toContain("New items 60,000 IQD − credit 25,000 IQD + delivery 5,000 IQD: the courier collects 40,000 IQD.");
        expect(preview.text).toContain("⚠ Serum: only 1 available, 2 needed.");

        createAfterSaleOrder.mockResolvedValue({ success: true, orderId: "c3", orderNumber: "RPL-1005-1" });
        await call("replace_order", {
            order: "1005", lines: [{ line: 1, qty: 1 }], new_items: [{ product: "SR-1", qty: 2 }], customer_pays_delivery: true, confirm: true,
        });
        expect(createAfterSaleOrder).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: STORE }),
            expect.objectContaining({
                kind: "replacement",
                lines: [{ originalLine: 0, qty: 1 }],
                outLines: [{ productId: SERUM, variantId: null, qty: 2 }],
                chargeFee: true,
            }),
        );
    });
});

describe("returns intake", () => {
    beforeEach(() => {
        env.tables.after_sale_items.push(
            { id: "22222222-2222-4222-8222-222222222222", tenant_id: STORE, direction: "back", expects_back: true, disposition: null, name: "Serum", qty: 1, created_at: "2026-10-30T08:00:00Z", child: { order_id: "RTN-1005-1", status: "return_pending", customer_name: "Zahraa" } },
            { id: "33333333-3333-4333-8333-333333333333", tenant_id: OTHER, direction: "back", expects_back: true, disposition: null, name: "Cream", qty: 1, created_at: "2026-10-30T08:00:00Z", child: { order_id: "RTN-9-1", status: "return_pending", customer_name: "X" } },
        );
    });

    it("lists only this store's items", async () => {
        const res = await call("pending_returns", {});
        expect(res.text).toContain("Serum ×1 on #RTN-1005-1");
        expect(res.text).not.toContain("Cream");
    });

    it("receives through the shared path as the caller", async () => {
        receiveAfterSaleItem.mockResolvedValue({ success: true });
        const res = await call("receive_return", { item_id: "22222222-2222-4222-8222-222222222222", condition: "sealed" });
        expect(res.text).toBe("Received Serum ×1 on #RTN-1005-1: sealed, back in stock.");
        expect(receiveAfterSaleItem).toHaveBeenCalledWith(
            { userId: "u1", tenantId: STORE, role: "admin", actorName: "Ali (via Claude)" },
            { itemId: "22222222-2222-4222-8222-222222222222", condition: "sealed", note: null },
        );
    });

    it("cannot receive another store's item", async () => {
        const res = await call("receive_return", { item_id: "33333333-3333-4333-8333-333333333333", condition: "sealed" });
        expect(res.isError).toBe(true);
        expect(receiveAfterSaleItem).not.toHaveBeenCalled();
    });
});
