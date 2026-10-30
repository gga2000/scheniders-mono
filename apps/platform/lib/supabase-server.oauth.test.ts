import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/env", () => ({
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
}));

import {
    OAuthClientTokenRefusedError,
    createSupabaseServerClientWithToken,
    verifyAccessToken,
} from "./supabase-server";

const token = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const CLAUDE = token({ sub: "u1", client_id: "claude" });
const APP = token({ sub: "u1" });

beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("Claude connector tokens outside /api/mcp", () => {
    it("verifyAccessToken refuses them without asking Supabase", async () => {
        expect(await verifyAccessToken(CLAUDE)).toEqual({ user: null, error: new OAuthClientTokenRefusedError().message });
        expect(getUser).not.toHaveBeenCalled();
    });

    it("the token client refuses to be built for one", () => {
        expect(() => createSupabaseServerClientWithToken(CLAUDE)).toThrow(OAuthClientTokenRefusedError);
    });

    it("/api/mcp opts in explicitly", async () => {
        expect(await verifyAccessToken(CLAUDE, { allowOAuthClient: true })).toEqual({ user: { id: "u1" }, error: null });
        expect(() => createSupabaseServerClientWithToken(CLAUDE, { allowOAuthClient: true })).not.toThrow();
    });

    it("app session tokens are unaffected", async () => {
        expect(await verifyAccessToken(APP)).toEqual({ user: { id: "u1" }, error: null });
    });
});
