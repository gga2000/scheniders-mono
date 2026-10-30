import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { env } from "@/lib/env";

/**
 * RFC 9728 metadata for the MCP endpoint: tells Claude that tokens come from
 * this project's Supabase Auth OAuth server. Served at the bare path and at
 * the path-suffixed form (`/.well-known/oauth-protected-resource/api/mcp`)
 * some clients probe first.
 */
const handler = protectedResourceHandler({
    authServerUrls: [`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
});

const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
