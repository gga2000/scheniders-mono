import type { McpServer } from "@modelcontextprotocol/server";
import { registerStoreReadTools } from "@/lib/mcp/tools/store-read";
import { registerOrderReadTools } from "@/lib/mcp/tools/orders-read";
import { registerOrderWriteTools } from "@/lib/mcp/tools/orders-write";

export const MCP_SERVER_INFO = { name: "schenider-platform", version: "1.0.0" };

export const MCP_INSTRUCTIONS = [
    "You are working inside one Schenider store (an Iraqi COD e-commerce business). Call get_store first.",
    "Money is whole Iraqi dinars (IQD); there is no tax. Dates are Baghdad time.",
    "Write tools change the live store. Before any write, tell the user exactly what will change; bulk status changes and new orders return a preview first and need confirm: true.",
    "You cannot delete records or change team, permissions, wallet, billing or payroll.",
].join("\n");

export function registerPlatformTools(server: McpServer): void {
    registerStoreReadTools(server);
    registerOrderReadTools(server);
    registerOrderWriteTools(server);
}
