import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerPlatformTools } from "@/lib/mcp/server";
import { verifyMcpToken } from "@/lib/mcp/caller";

/**
 * Claude (MCP) connector for the platform app. Middleware does not run on
 * `/api`, so this route authenticates every request itself: `withMcpAuth`
 * answers 401 with a challenge pointing at the protected-resource metadata,
 * and the tools resolve the caller's store on every call.
 */
const handler = createMcpHandler(registerPlatformTools, {
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_INSTRUCTIONS,
});

const authed = withMcpAuth(handler, verifyMcpToken, {
    required: true,
    // The path-suffixed document names this endpoint as the resource (RFC 9728 §3.1).
    resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export const runtime = "nodejs";
export const maxDuration = 60;

export { authed as GET, authed as POST };
