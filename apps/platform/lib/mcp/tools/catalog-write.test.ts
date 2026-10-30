import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { registerCatalogWriteTools } from "./catalog-write";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const STORE = "tenant-a";
const OTHER = "tenant-b";
const SERUM = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "22222222-2222-4222-8222-222222222222";
const TEE = "33333333-3333-4333-8333-333333333333";

let env: ReturnType<typeof fakeDb>;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, cb: Handler) => void (registered[name] = cb) } as unknown as McpServer;
    registerCatalogWriteTools(server);
    return registered;
}

function asCaller(role: McpCaller["role"] = "admin") {
    resolveMcpCaller.mockResolvedValue({
        ok: true,
        caller: { userId: "u1", email: null, displayName: "Ali", tenantId: STORE, role, clientId: "c", db: env.db, token: "t" },
    });
}

const call = async (name: string, args: Record<string, unknown>) => {
    const res = await tools()[name](args, {});
    return { text: res.content[0].text, isError: res.isError === true };
};

const product = (id: string, tenant: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, tenant_id: tenant, name, sku: null, price: 25000, compare_at_price: null, stock_quantity: 10, reserved_quantity: 2,
    is_visible: true, is_archived: false, is_supply: false, ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    const stockRpc = (name: string) => (args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return name === "set_counted_stock" ? (args.p_counted as never) : (15 as never);
    };
    env = fakeDb(
        {
            products: [
                product(SERUM, STORE, "Vitamin C Serum", { sku: "SR-1" }),
                product(FOREIGN, OTHER, "Vitamin C Serum"),
                product(TEE, STORE, "T-shirt"),
            ],
            product_variants: [
                { id: "v-red", product_id: TEE, tenant_id: STORE, name: "Red", sku: null, price: null, compare_at_price: null, stock_quantity: 3, reserved_quantity: 0, is_enabled: true },
            ],
            product_price_history: [],
            product_activity_log: [],
            blacklist: [],
            activity_logs: [],
        },
        { adjust_product_stock: stockRpc("adjust_product_stock"), set_counted_stock: stockRpc("set_counted_stock") },
    );
    asCaller();
});

describe("update_product", () => {
    it("changes the price by name in the caller's store only, with price history and product activity", async () => {
        const res = await call("update_product", { product: "vitamin c serum", price: 30000, confirm: false });
        expect(res.isError).toBe(false);
        expect(env.tables.products[0].price).toBe(30000);
        expect(env.tables.products[1].price).toBe(25000);
        const patch = env.calls.find((c) => c.table === "products" && c.op === "update");
        expect(patch?.filters).toEqual(expect.arrayContaining([`tenant_id=${STORE}`, `id=${SERUM}`]));
        expect(env.tables.product_price_history).toEqual([
            expect.objectContaining({ product_id: SERUM, tenant_id: STORE, old_price: 25000, new_price: 30000, changed_by: "Ali (via Claude)" }),
        ]);
        expect(env.tables.product_activity_log[0]).toMatchObject({ action: "price_changed", tenant_id: STORE, user_id: "u1" });
    });

    it("previews a price that drops below half until confirm", async () => {
        const preview = await call("update_product", { product: "SR-1", price: 9000, confirm: false });
        expect(preview.text).toMatch(/^Preview/);
        expect(env.tables.products[0].price).toBe(25000);
        await call("update_product", { product: "SR-1", price: 9000, confirm: true });
        expect(env.tables.products[0].price).toBe(9000);
    });

    it("refuses a compare-at price that is not above the price", async () => {
        const res = await call("update_product", { product: "SR-1", compare_at_price: 20000, confirm: false });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("must be higher than the price");
    });

    it("cannot reach another store's product by id", async () => {
        const res = await call("update_product", { product: FOREIGN, visible: false, confirm: false });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("No product");
        expect(env.tables.products[1].is_visible).toBe(true);
    });

    it("refuses a viewer", async () => {
        asCaller("viewer");
        const res = await call("update_product", { product: "SR-1", visible: false, confirm: false });
        expect(res).toEqual({ isError: true, text: "Your role in this store is read-only." });
    });
});

describe("stock", () => {
    it("adjusts through adjust_product_stock after checking the product is in this store", async () => {
        const res = await call("adjust_stock", { product: "SR-1", change: 5, reason: "received", confirm: false });
        expect(res.text).toBe("Vitamin C Serum: stock +5 (received), now 15.");
        expect(rpcCalls).toEqual([
            { name: "adjust_product_stock", args: expect.objectContaining({ p_product_id: SERUM, p_variant_id: null, p_delta: 5, p_reason: "received", p_notes: "via Claude" }) },
        ]);
    });

    it("asks which variant for a product that has variants", async () => {
        const res = await call("adjust_stock", { product: "T-shirt", change: 1, reason: "received", confirm: false });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("has variants; say which one: Red");
        expect(rpcCalls).toHaveLength(0);
    });

    it("previews stock going below zero", async () => {
        const res = await call("adjust_stock", { product: "T-shirt", variant: "red", change: -5, reason: "damaged", confirm: false });
        expect(res.text).toContain("stock 3 → -2");
        expect(rpcCalls).toHaveLength(0);
    });

    it("never touches another store's product", async () => {
        const res = await call("set_stock_count", { product: FOREIGN, counted: 0 });
        expect(res.isError).toBe(true);
        expect(rpcCalls).toHaveLength(0);
    });

    it("sets a shelf count", async () => {
        const res = await call("set_stock_count", { product: "SR-1", counted: 7 });
        expect(res.text).toBe("Vitamin C Serum: stock 10 → 7 (counted).");
        expect(rpcCalls[0]).toMatchObject({ name: "set_counted_stock", args: { p_product_id: SERUM, p_counted: 7 } });
    });
});

describe("blacklist_customer", () => {
    it("stamps the store and the normalized phone, once", async () => {
        const first = await call("blacklist_customer", { phone: "+964 770 123 4567", reason: "Refused 3 orders" });
        expect(first.text).toBe("Blacklisted 07701234567: Refused 3 orders.");
        expect(env.tables.blacklist).toEqual([
            expect.objectContaining({ tenant_id: STORE, phone: "07701234567", reason: "Refused 3 orders", added_by: "Ali (via Claude)" }),
        ]);
        const again = await call("blacklist_customer", { phone: "07701234567", reason: "again" });
        expect(again.text).toContain("already blacklisted");
        expect(env.tables.blacklist).toHaveLength(1);
    });
});
