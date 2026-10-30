import * as Sentry from "@sentry/nextjs";
import type { CallToolResult, McpServer, ServerContext, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { resolveMcpCaller, type McpCaller } from "@/lib/mcp/caller";
import { isAdminRole } from "@/lib/permissions";

/**
 * A failure the caller should read as-is: no access, not found, invalid
 * input. Anything else is unexpected, goes to Sentry, and reaches Claude as a
 * generic message.
 */
export class McpToolError extends Error {}

/** Roles that may change orders — the same list the order server actions use. */
const WRITE_ROLES = new Set(["admin", "super_admin", "employee"]);

export function requireWriter(caller: McpCaller): void {
    if (!WRITE_ROLES.has(caller.role)) {
        throw new McpToolError("Your role in this store is read-only.");
    }
}

/** Money figures follow the dashboard rule: admins only. */
export function canSeeMoney(caller: McpCaller): boolean {
    return isAdminRole(caller.role);
}

export type ToolDefinition<S extends z.ZodObject> = {
    name: string;
    title: string;
    description: string;
    input: S;
    /** `write` tools are marked destructive so the client asks before running them. */
    kind: "read" | "write";
    run: (caller: McpCaller, input: z.output<S>) => Promise<string>;
};

function text(body: string, isError = false): CallToolResult {
    return { content: [{ type: "text", text: body }], ...(isError ? { isError: true } : {}) };
}

/**
 * Every call is written to `activity_logs` with the caller's own token, so RLS
 * checks the row is theirs and in their store. Returns false when the row could
 * not be written, so a write tool can say its change is missing from the log.
 */
async function audit(
    caller: McpCaller,
    tool: string,
    kind: "read" | "write",
    input: unknown,
    outcome: { ok: boolean; error?: string },
): Promise<boolean> {
    const { error } = await caller.db.from("activity_logs").insert({
        user_id: caller.userId,
        user_email: caller.email,
        tenant_id: caller.tenantId,
        action: "mcp.tool_call",
        entity_type: "mcp",
        entity_id: null,
        details: { source: "claude", tool, kind, client_id: caller.clientId, input, ...outcome },
        user_agent: "claude-mcp",
    });
    if (error) {
        Sentry.captureException(new Error(`MCP audit write failed: ${error.message}`), { extra: { tool } });
        return false;
    }
    return true;
}

const AUDIT_MISSING = "\n\nWarning: this change was made but could not be written to the activity log.";

export function registerTool<S extends z.ZodObject>(server: McpServer, def: ToolDefinition<S>): void {
    const annotations: ToolAnnotations =
        def.kind === "read"
            ? { readOnlyHint: true, openWorldHint: false }
            : { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

    // The SDK parses the arguments with `def.input` before calling back, so the
    // value is that schema's output; its callback type cannot express a generic
    // schema, hence the one cast below.
    const schema: z.ZodObject = def.input;
    const callback = async (args: z.output<typeof schema>, ctx: ServerContext): Promise<CallToolResult> => {
        const input = args as z.output<S>;
        const resolved = await resolveMcpCaller(ctx.http?.authInfo);
        if (!resolved.ok) return text(resolved.error, true);
        const caller = resolved.caller;

        let body: string;
        try {
            body = await def.run(caller, input);
        } catch (err) {
            const known = err instanceof McpToolError;
            if (!known) Sentry.captureException(err, { extra: { tool: def.name, tenantId: caller.tenantId } });
            await audit(caller, def.name, def.kind, input, { ok: false, error: err instanceof Error ? err.message : String(err) });
            return text(known ? err.message : "Something went wrong. Check the record in the app before trying again.", true);
        }
        const logged = await audit(caller, def.name, def.kind, input, { ok: true });
        return text(logged || def.kind === "read" ? body : body + AUDIT_MISSING);
    };

    server.registerTool(def.name, { title: def.title, description: def.description, inputSchema: schema, annotations }, callback);
}
