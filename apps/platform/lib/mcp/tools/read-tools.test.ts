import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { registerOrderReadTools } from "./orders-read";
import { registerStoreReadTools } from "./store-read";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const STORE = "tenant-a";
let env: ReturnType<typeof fakeDb>;

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, cb: Handler) => void (registered[name] = cb) } as unknown as McpServer;
    registerOrderReadTools(server);
    registerStoreReadTools(server);
    return registered;
}

function asCaller(role: McpCaller["role"]) {
    resolveMcpCaller.mockResolvedValue({
        ok: true,
        caller: { userId: "u1", email: null, displayName: "Sara", tenantId: STORE, role, clientId: "c", db: env.db, token: "t" },
    });
}

const call = async (name: string, args: Record<string, unknown> = {}) => (await tools()[name](args, {})).content[0].text;

const row = (id: string, tenant: string, status: string, price: number) => ({
    id,
    order_id: id,
    tenant_id: tenant,
    status,
    price,
    delivery_fee: 5000,
    is_return: false,
    is_test: false,
    is_archived: false,
    deleted_at: null,
    created_at: "2026-10-30T08:00:00Z",
    customer_name: "C",
    phone: "07700000000",
    items: [],
});

beforeEach(() => {
    vi.clearAllMocks();
    env = fakeDb({
        orders: [row("1", STORE, "delivered", 30000), row("2", STORE, "new", 20000), row("3", "tenant-b", "delivered", 999000)],
        activity_logs: [],
    });
    asCaller("admin");
});

describe("read tools", () => {
    it("search_orders reads only the caller's store", async () => {
        const text = await call("search_orders", { include_archived: false, limit: 20 });
        expect(text).toContain("2 order(s) match");
        expect(text).not.toContain("#3");
        const read = env.calls.find((c) => c.table === "orders");
        expect(read?.filters).toContain(`tenant_id=${STORE}`);
    });

    it("sales_summary shows revenue to admins only", async () => {
        expect(await call("sales_summary", { from: "2026-10-30" })).toContain("Delivered revenue (items after discount, without delivery fees): 30,000 IQD");

        asCaller("employee");
        const text = await call("sales_summary", { from: "2026-10-30" });
        expect(text).toContain("Revenue is shown to store admins only.");
        expect(text).not.toContain("30,000");
    });

    it("search and customer lookup leave out orders in the trash", async () => {
        const live = { ...row("10", STORE, "delivered", 30000), phone: "07701112222", customer_name: "Zainab" };
        const trashed = { ...row("11", STORE, "rejected", 20000), phone: "07701112222", customer_name: "Zainab", deleted_at: "2026-10-29T10:00:00Z" };
        env = fakeDb({ activity_logs: [] }, { search_orders_v2: () => [live, trashed] });
        asCaller("admin");

        const search = await call("search_orders", { query: "Zainab", include_archived: false, limit: 20 });
        expect(search).toContain("1 order(s) match");
        expect(search).not.toContain("#11");

        const customer = await call("find_customer", { phone: "+964 770 111 2222" });
        expect(customer).toContain("Orders: totals are not counted yet");
        expect(customer).toContain("#10");
    });

    it("find_customer takes its counts from the customers page totals of this store", async () => {
        const order = { ...row("30", STORE, "rejected", 34750), phone: "07701112222", customer_name: "Zainab" };
        const totals = (tenant: string, spent: number) => ({
            tenant_id: tenant, customer_phone: "7701112222", total_orders: 2, completed_count: 1, rejected_count: 0,
            no_response_count: 0, cancelled_count: 1, returned_count: 0, total_spent: spent,
        });
        env = fakeDb(
            { activity_logs: [], customer_aggregates: [totals("tenant-b", 999000), totals(STORE, 34750)] },
            { search_orders_v2: () => [order] },
        );
        asCaller("admin");
        const text = await call("find_customer", { phone: "07701112222" });
        expect(text).toContain("Orders: 2 (delivered 1, rejected 0, no answer 0, cancelled 1, returns 0), total spent 34,750 IQD");
        expect(text).not.toContain("999,000");

        asCaller("employee");
        expect(await call("find_customer", { phone: "07701112222" })).not.toContain("total spent");
    });

    it("find_customer lists candidates when a phone matches no customer exactly", async () => {
        const a = { ...row("20", STORE, "new", 1000), phone: "07701112222", customer_name: "Ali" };
        const b = { ...row("21", STORE, "new", 1000), phone: "07701113333", customer_name: "Huda" };
        env = fakeDb({ activity_logs: [] }, { search_orders_v2: () => [a, b] });
        asCaller("admin");
        const text = await call("find_customer", { phone: "0770111" });
        expect(text).toContain('2 customer(s) match');
        expect(text).toContain("Huda 07701113333");
    });

    it("list_products finds low stock past the first page of the catalog", async () => {
        const products = Array.from({ length: 1205 }, (_, i) => ({
            id: `p${i}`, tenant_id: STORE, name: `P${String(i).padStart(4, "0")}`, sku: null, price: 1000,
            stock_quantity: i === 1204 ? 1 : 100, reserved_quantity: 0, open_box_quantity: i === 1204 ? 3 : 0, low_stock_threshold: null,
            is_visible: true, is_archived: false, is_supply: false,
        }));
        env = fakeDb({ products, product_variants: [], activity_logs: [] });
        asCaller("admin");
        const text = await call("list_products", { low_stock: true, include_hidden: true, limit: 50 });
        expect(text).toContain("1 product(s)");
        expect(text).toContain("P1204");
        expect(text).toContain("stock 1, reserved 0, available 1, open box left 3");
    });

    it("every call is written to the activity log as a Claude tool call", async () => {
        await call("search_orders", { include_archived: false, limit: 5 });
        expect(env.tables.activity_logs).toEqual([
            expect.objectContaining({ action: "mcp.tool_call", tenant_id: STORE, user_id: "u1", details: expect.objectContaining({ tool: "search_orders", kind: "read", ok: true }) }),
        ]);
    });
});
