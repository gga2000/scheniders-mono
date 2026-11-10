import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.fn();
const CLAUDE_CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let accessList: string[] = [];
let claudeClients: string[] = [];

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a),
    createSupabaseServerClientWithToken: vi.fn(),
    createSupabaseServiceClient: () => ({
        rpc: (_fn: string, args: { p_client_id: string }) =>
            Promise.resolve({ data: claudeClients.includes(args.p_client_id), error: null }),
        from: () => {
            let id = "";
            const chain = {
                select: () => chain,
                eq: (_col: string, v: string) => {
                    id = v;
                    return chain;
                },
                maybeSingle: () => Promise.resolve({ data: accessList.includes(id) ? { user_id: id } : null, error: null }),
            };
            return chain;
        },
    }),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({ resolveActiveTenant: vi.fn() }));

import { verifyMcpToken } from "./caller";

const USER = "94d3e409-52c2-447d-88af-8aff3758f622";
const jwt = (claims: Record<string, unknown>) =>
    ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
const req = new Request("https://app.test/api/mcp");

beforeEach(() => {
    vi.clearAllMocks();
    accessList = [USER];
    claudeClients = [CLAUDE_CLIENT];
    verifyAccessToken.mockResolvedValue({ user: { id: USER, email: "ali@example.com" }, error: null });
});

describe("verifyMcpToken", () => {
    it("accepts an OAuth token of a user on the access list", async () => {
        const token = jwt({ sub: USER, client_id: CLAUDE_CLIENT, exp: 2000000000 });
        await expect(verifyMcpToken(req, token)).resolves.toMatchObject({
            token,
            clientId: CLAUDE_CLIENT,
            expiresAt: 2000000000,
            extra: { userId: USER, email: "ali@example.com" },
        });
    });

    it("rejects an app session token (no client_id), which would skip the database guard", async () => {
        await expect(verifyMcpToken(req, jwt({ sub: USER }))).resolves.toBeUndefined();
        expect(verifyAccessToken).not.toHaveBeenCalled();
    });

    it("rejects a user who is not on the access list", async () => {
        accessList = [];
        await expect(verifyMcpToken(req, jwt({ sub: USER, client_id: CLAUDE_CLIENT }))).resolves.toBeUndefined();
    });

    it("rejects a token issued to an app that is not Claude", async () => {
        await expect(verifyMcpToken(req, jwt({ sub: USER, client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))).resolves.toBeUndefined();
    });

    it("rejects a non-uuid client id before asking the database", async () => {
        await expect(verifyMcpToken(req, jwt({ sub: USER, client_id: "not-a-uuid" }))).resolves.toBeUndefined();
    });

    it("rejects a token Supabase does not accept", async () => {
        verifyAccessToken.mockResolvedValue({ user: null, error: "invalid" });
        await expect(verifyMcpToken(req, jwt({ sub: USER, client_id: CLAUDE_CLIENT }))).resolves.toBeUndefined();
    });

    it("rejects a missing or malformed token", async () => {
        await expect(verifyMcpToken(req, undefined)).resolves.toBeUndefined();
        await expect(verifyMcpToken(req, "not-a-jwt")).resolves.toBeUndefined();
    });
});
