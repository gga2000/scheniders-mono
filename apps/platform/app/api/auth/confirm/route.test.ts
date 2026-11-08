import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
}));
vi.mock("@/lib/team-provisioning", () => ({ provisionInvitedUserIfNeeded: vi.fn() }));

const verifyOtp = vi.fn();
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({ auth: { verifyOtp } }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

async function redirectFor(query: string): Promise<string | null> {
    const res = await GET(new NextRequest(`https://app.test/api/auth/confirm?${query}`));
    return res.headers.get("location");
}

describe("auth confirm (email link) route", () => {
    beforeEach(() => {
        verifyOtp.mockReset();
        verifyOtp.mockResolvedValue({ data: { user: null }, error: null });
    });

    it("verifies a reset link and opens the reset page", async () => {
        expect(await redirectFor("token_hash=h&type=recovery&next=/reset-password")).toBe(
            "https://app.test/reset-password",
        );
        expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "recovery" });
    });

    it("sends an expired reset link back to forgot-password", async () => {
        verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
        expect(await redirectFor("token_hash=h&type=recovery&next=/reset-password")).toBe(
            "https://app.test/forgot-password?link=expired",
        );
    });

    it("rejects an unknown type without calling Supabase", async () => {
        expect(await redirectFor("token_hash=h&type=bogus")).toBe("https://app.test/login");
        expect(verifyOtp).not.toHaveBeenCalled();
    });

    it("never leaves the site through next", async () => {
        expect(await redirectFor("token_hash=h&type=signup&next=//evil.com")).toBe("https://app.test/orders");
    });
});
