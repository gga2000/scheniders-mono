import { describe, expect, it, vi } from "vitest";
import { createMcpHandler } from "mcp-handler";

vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ createOrderForTenant: vi.fn() }));

import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerPlatformTools } from "./server";

async function rpc(handler: (r: Request) => Promise<Response>, method: string, params: Record<string, unknown> = {}) {
    const res = await handler(
        new Request("http://localhost/api/mcp", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
    );
    const body = await res.text();
    const json = body.startsWith("{") ? body : body.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? "{}";
    return JSON.parse(json) as { result?: { tools?: { name: string; annotations?: Record<string, boolean>; inputSchema: { properties?: object } }[] } };
}

describe("MCP server", () => {
    it("lists every tool with a JSON schema, and marks write tools destructive", async () => {
        const handler = createMcpHandler(registerPlatformTools, { serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS });
        const { result } = await rpc(handler, "tools/list");
        const tools = result?.tools ?? [];
        expect(tools.map((t) => t.name).sort()).toEqual([
            "add_order_note",
            "adjust_stock",
            "blacklist_customer",
            "create_order",
            "find_customer",
            "get_order",
            "get_store",
            "list_products",
            "sales_summary",
            "search_orders",
            "set_stock_count",
            "update_order",
            "update_order_status",
            "update_product",
        ]);
        for (const t of tools) expect(t.inputSchema).toBeTruthy();
        const writes = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name).sort();
        expect(writes).toEqual([
            "add_order_note",
            "adjust_stock",
            "blacklist_customer",
            "create_order",
            "set_stock_count",
            "update_order",
            "update_order_status",
            "update_product",
        ]);
    });
});
