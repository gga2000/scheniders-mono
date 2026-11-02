import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
}));
vi.mock("@/lib/team-provisioning", () => ({ provisionInvitedUserIfNeeded: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { exchangeCodeForSession: async () => ({ data: { user: null }, error: null }) },
    }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

async function redirectFor(next: string): Promise<string | null> {
    const url = `https://app.test/api/auth/callback?code=c&next=${encodeURIComponent(next)}`;
    const res = await GET(new NextRequest(url));
    return res.headers.get("location");
}

describe("auth callback next param", () => {
    it("follows a same-site path", async () => {
        expect(await redirectFor("/oauth/consent?authorization_id=1")).toBe(
            "https://app.test/oauth/consent?authorization_id=1",
        );
    });

    it.each(["@evil.com", "//evil.com", "https://evil.com", "/\\evil.com"])("never leaves the site for %s", async (next) => {
        const loc = await redirectFor(next);
        expect(loc).toBe("https://app.test/orders");
    });
});
