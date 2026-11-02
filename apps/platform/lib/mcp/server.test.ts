import { describe, expect, it, vi } from "vitest";
import { createMcpHandler } from "mcp-handler";
import {
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ createOrderForTenant: vi.fn() }));

import { MCP_INSTRUCTIONS, MCP_SERVER_CAPABILITIES, MCP_SERVER_INFO, registerPlatformTools } from "./server";

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
        const handler = createMcpHandler(registerPlatformTools, {
            serverInfo: MCP_SERVER_INFO,
            instructions: MCP_INSTRUCTIONS,
            capabilities: MCP_SERVER_CAPABILITIES,
        });
        const { result } = await rpc(handler, "tools/list");
        const tools = result?.tools ?? [];
        expect(tools.map((t) => t.name).sort()).toEqual([
            "abandoned_carts",
            "add_customer_note",
            "add_expense",
            "add_order_note",
            "adjust_stock",
            "blacklist_customer",
            "create_order",
            "delivery_report",
            "find_customer",
            "get_order",
            "get_store",
            "list_expenses",
            "list_products",
            "pending_returns",
            "profit_report",
            "receive_return",
            "refund_order",
            "replace_order",
            "sales_summary",
            "search_orders",
            "set_stock_count",
            "ship_orders",
            "tag_customer",
            "update_expense",
            "update_order",
            "update_order_status",
            "update_product",
        ]);
        for (const t of tools) expect(t.inputSchema).toBeTruthy();
        const writes = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name).sort();
        expect(writes).toEqual([
            "add_customer_note",
            "add_expense",
            "add_order_note",
            "adjust_stock",
            "blacklist_customer",
            "create_order",
            "receive_return",
            "refund_order",
            "replace_order",
            "set_stock_count",
            "ship_orders",
            "tag_customer",
            "update_expense",
            "update_order",
            "update_order_status",
            "update_product",
        ]);
    });

    it("ends a subscriptions/listen stream at once instead of holding it open until the function times out", async () => {
        const handler = createMcpHandler(registerPlatformTools, {
            serverInfo: MCP_SERVER_INFO,
            instructions: MCP_INSTRUCTIONS,
            capabilities: MCP_SERVER_CAPABILITIES,
        });
        const version = "2026-07-28";
        const res = await handler(
            new Request("http://localhost/api/mcp", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                    "mcp-protocol-version": version,
                    "mcp-method": "subscriptions/listen",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 7,
                    method: "subscriptions/listen",
                    params: {
                        notifications: { toolsListChanged: true, promptsListChanged: true, resourcesListChanged: true },
                        _meta: {
                            [PROTOCOL_VERSION_META_KEY]: version,
                            [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
                            [CLIENT_CAPABILITIES_META_KEY]: {},
                        },
                    },
                }),
            }),
        );
        // Before the fix this read never finished: the stream stayed open until Vercel killed it at 60 s.
        const body = await res.text();
        const frames = body.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
        expect(frames[0]).toMatchObject({ method: "notifications/subscriptions/acknowledged", params: { notifications: {} } });
        expect(frames.at(-1)).toMatchObject({ id: 7, result: { resultType: "complete" } });
    }, 5000);
});
