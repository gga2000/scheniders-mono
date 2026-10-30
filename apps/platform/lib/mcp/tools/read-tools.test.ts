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

    it("every call is written to the activity log as a Claude tool call", async () => {
        await call("search_orders", { include_archived: false, limit: 5 });
        expect(env.tables.activity_logs).toEqual([
            expect.objectContaining({ action: "mcp.tool_call", tenant_id: STORE, user_id: "u1", details: expect.objectContaining({ tool: "search_orders", kind: "read", ok: true }) }),
        ]);
    });
});
